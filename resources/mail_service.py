#!/usr/bin/env python
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
import re
import socket
import sys
import threading
import time
import traceback
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ACCOUNT = None
ACCOUNT_LOCK = threading.Lock()
ACCOUNT_CREATED_AT = None
LAST_ERROR = ''
LAST_OK_AT = None
MAIL_INDEX = {}
SERVER = None
MAIL_ENV_KEYS = {'MAIL_SMTP', 'MAIL_DOMAIN_USER', 'MAIL_PASS', 'MAIL_DOMAIN', 'MAIL_SERVER'}
SKILL_ALIASES = ('ly_outlook_mail', '领益Outlook邮件', '领益 Outlook 邮件', 'ly-outlook', 'ly-outlook-mail')
DEFAULT_DOMAIN = 'LSTECH'
DEFAULT_SERVER = 'mail.lingyiitech.com'
DEFAULT_EWS_PORT = 443

# 网络抖动自愈参数
EWS_TIMEOUT_SECONDS = 20        # 单次 EWS 请求超时
EWS_RETRY_MAX_WAIT = 180        # FaultTolerance 策略最长重试窗口（秒）
RECONNECT_COOLDOWN_SECONDS = 10  # 连接失效后重建账号的冷却期，避免断网时高频重连


def _json(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False, default=str).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Content-Length', str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _read_body(handler):
    length = int(handler.headers.get('Content-Length') or 0)
    if length <= 0:
        return {}
    raw = handler.rfile.read(length).decode('utf-8', errors='replace')
    return json.loads(raw or '{}')


def _set_env(config):
    mapping = {
        'MAIL_SERVER': config.get('server') or config.get('MAIL_SERVER') or DEFAULT_SERVER,
        'MAIL_SMTP': config.get('smtp') or config.get('email') or config.get('MAIL_SMTP') or '',
        'MAIL_EMAIL': config.get('email') or config.get('smtp') or '',
        'MAIL_DOMAIN': config.get('domain') or config.get('MAIL_DOMAIN') or DEFAULT_DOMAIN,
        'MAIL_DOMAIN_USER': config.get('domainUser') or config.get('domain_user') or config.get('username') or '',
        'MAIL_USERNAME': config.get('username') or config.get('domainUser') or config.get('domain_user') or '',
        'MAIL_PASS': config.get('password') or config.get('MAIL_PASS') or '',
        'MAIL_PASSWORD': config.get('password') or config.get('MAIL_PASSWORD') or '',
    }
    for key, value in mapping.items():
        os.environ[key] = str(value or '')


def _strip_json5_comments(text):
    result = []
    index = 0
    in_string = False
    quote = ''
    escape = False
    while index < len(text):
        char = text[index]
        nxt = text[index + 1] if index + 1 < len(text) else ''
        if in_string:
            result.append(char)
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == quote:
                in_string = False
            index += 1
            continue
        if char in ('"', "'"):
            in_string = True
            quote = char
            result.append(char)
            index += 1
            continue
        if char == '/' and nxt == '/':
            index += 2
            while index < len(text) and text[index] not in '\r\n':
                index += 1
            continue
        if char == '/' and nxt == '*':
            index += 2
            while index + 1 < len(text) and text[index:index + 2] != '*/':
                index += 1
            index += 2
            continue
        result.append(char)
        index += 1
    return ''.join(result)


def _load_json_or_json5(path):
    raw = path.read_text(encoding='utf-8')
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        text = _strip_json5_comments(raw)
        text = re.sub(r'(?m)([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)', r'\1"\2"\3', text)
        text = re.sub(r',(\s*[}\]])', r'\1', text)
        return json.loads(text)


def _entry_env_config(entry):
    if not isinstance(entry, dict):
        return {}
    merged = {}
    for source in (entry.get('config'), entry.get('env')):
        if isinstance(source, dict):
            merged.update({str(key): str(value) for key, value in source.items() if value is not None})
    return merged


def _apply_openclaw_env():
    configured = os.getenv('OPENCLAW_CONFIG')
    path = Path(configured).expanduser() if configured else Path.home() / '.openclaw' / 'openclaw.json'
    if not path.is_file():
        return
    try:
        config = _load_json_or_json5(path)
    except Exception:
        return
    entries = config.get('skills', {}).get('entries', {})
    if not isinstance(entries, dict):
        return
    candidates = []
    for key in SKILL_ALIASES:
        if isinstance(entries.get(key), dict):
            candidates.append(entries[key])
    candidates.extend(entry for entry in entries.values() if isinstance(entry, dict))
    for entry in candidates:
        values = _entry_env_config(entry)
        if {'MAIL_SMTP', 'MAIL_DOMAIN_USER', 'MAIL_PASS'}.issubset(values):
            for key, value in values.items():
                if key in MAIL_ENV_KEYS and not os.getenv(key):
                    os.environ[key] = value
            return


def _reset_account():
    global ACCOUNT, LAST_ERROR, MAIL_INDEX, ACCOUNT_CREATED_AT, LAST_OK_AT
    with ACCOUNT_LOCK:
        ACCOUNT = None
        ACCOUNT_CREATED_AT = None
        LAST_ERROR = ''
        LAST_OK_AT = None
        MAIL_INDEX = {}


def _invalidate_account(reason):
    """作废缓存账号：网络瞬时故障后丢弃死连接，让下一次请求用全新账号重连。"""
    global ACCOUNT, LAST_ERROR
    with ACCOUNT_LOCK:
        if ACCOUNT is not None:
            ACCOUNT = None
        if reason:
            LAST_ERROR = f'连接已断开，等待自动重连: {reason}'


def _mark_ok():
    global LAST_ERROR, LAST_OK_AT
    LAST_ERROR = ''
    LAST_OK_AT = datetime.now(timezone.utc).isoformat()


_TRANSIENT_ERROR_TYPES = None
_NON_TRANSIENT_ERROR_TYPES = None


def _is_transient(exc):
    """判断是否为瞬时网络/服务错误（可重连重试），认证类错误不算。

    懒加载 exchangelib 错误类型：exchangelib 缺失时（/doctor 场景）退化为消息关键字判断。
    """
    global _TRANSIENT_ERROR_TYPES, _NON_TRANSIENT_ERROR_TYPES
    if _TRANSIENT_ERROR_TYPES is None:
        try:
            from exchangelib.errors import (
                ErrorServerBusy,
                ErrorInternalServerTransientError,
                RateLimitError,
                RedirectError,
                TransportError,
                UnauthorizedError,
            )
            _TRANSIENT_ERROR_TYPES = (
                ErrorServerBusy, ErrorInternalServerTransientError,
                RateLimitError, RedirectError, TransportError,
            )
            _NON_TRANSIENT_ERROR_TYPES = (UnauthorizedError,)
        except Exception:
            _TRANSIENT_ERROR_TYPES = ()
            _NON_TRANSIENT_ERROR_TYPES = ()
    if isinstance(exc, _NON_TRANSIENT_ERROR_TYPES):
        return False
    if isinstance(exc, _TRANSIENT_ERROR_TYPES):
        return True
    if isinstance(exc, (TimeoutError, ConnectionError, socket.timeout, socket.error)):
        return True
    text = str(exc or '').lower()
    return any(k in text for k in (
        'timed out', 'timeout', 'connection', 'eof', 'reset by peer',
        'broken pipe', 'read error', 'http 503', 'server busy',
        'cas error', 'rate limit', 'transient', 'back off',
        'getaddrinfo', 'name or service not known', 'dns'
    ))


def _run_with_reconnect(fn, *args, **kwargs):
    """请求级自愈：瞬时故障时作废账号并重试一次（冷却期内直接抛错，由调用方处理）。"""
    try:
        result = fn(_account(), *args, **kwargs)
        _mark_ok()
        return result
    except Exception as exc:
        if not _is_transient(exc):
            raise
        _invalidate_account(str(exc))
        result = fn(_account(), *args, **kwargs)
        _mark_ok()
        return result


def _account():
    global ACCOUNT, LAST_ERROR, ACCOUNT_CREATED_AT
    with ACCOUNT_LOCK:
        if ACCOUNT is not None:
            return ACCOUNT

        # 冷却期内不立即重建，避免断网时反复重连打爆 Exchange
        if ACCOUNT_CREATED_AT is not None and time.time() - ACCOUNT_CREATED_AT < RECONNECT_COOLDOWN_SECONDS:
            raise RuntimeError(LAST_ERROR or 'Exchange 连接断开，正在等待重连')

        _apply_openclaw_env()
        smtp = os.getenv('MAIL_SMTP') or os.getenv('MAIL_EMAIL')
        domain_user = os.getenv('MAIL_DOMAIN_USER') or os.getenv('MAIL_USERNAME')
        password = os.getenv('MAIL_PASS') or os.getenv('MAIL_PASSWORD')
        domain = os.getenv('MAIL_DOMAIN') or DEFAULT_DOMAIN
        server = os.getenv('MAIL_SERVER') or DEFAULT_SERVER

        if not smtp or not domain_user or not password:
            LAST_ERROR = '缺少邮件配置。需要 Exchange 服务器、邮箱地址、AD 域账号和密码'
            raise RuntimeError(LAST_ERROR)

        try:
            from exchangelib import Account, Configuration, Credentials, DELEGATE
            from exchangelib.protocol import BaseProtocol, FaultTolerance

            BaseProtocol.TIMEOUT = EWS_TIMEOUT_SECONDS
            credentials = Credentials(username=f'{domain}\\{domain_user}', password=password)
            config = Configuration(
                server=server,
                credentials=credentials,
                # 默认 FailFast 遇瞬时错误立即失败；FaultTolerance 做指数退避重试，
                # 显著提升公司网络抖动场景下的稳定性
                retry_policy=FaultTolerance(max_wait=EWS_RETRY_MAX_WAIT),
            )
            ACCOUNT = Account(
                primary_smtp_address=smtp,
                config=config,
                autodiscover=False,
                access_type=DELEGATE,
            )
            _ = ACCOUNT.inbox.name
            ACCOUNT_CREATED_AT = time.time()
            LAST_ERROR = ''
            return ACCOUNT
        except Exception as exc:
            LAST_ERROR = f'连接 Exchange 失败: {exc}'
            raise RuntimeError(LAST_ERROR) from exc


def _doctor():
    _apply_openclaw_env()
    try:
        import exchangelib  # noqa: F401
        exchangelib_ok = True
        dependency_error = ''
    except Exception as exc:
        exchangelib_ok = False
        dependency_error = str(exc)

    smtp = os.getenv('MAIL_SMTP') or os.getenv('MAIL_EMAIL') or ''
    domain_user = os.getenv('MAIL_DOMAIN_USER') or os.getenv('MAIL_USERNAME') or ''
    password = os.getenv('MAIL_PASS') or os.getenv('MAIL_PASSWORD') or ''
    domain = os.getenv('MAIL_DOMAIN') or DEFAULT_DOMAIN
    server = os.getenv('MAIL_SERVER') or DEFAULT_SERVER
    network = _probe_server(server)

    return {
        'ok': exchangelib_ok and network.get('tcp') and bool(smtp and domain_user and password),
        'dependency': {
            'exchangelib': exchangelib_ok,
            'error': dependency_error,
        },
        'network': network,
        'config': {
            'server': server,
            'smtp_present': bool(smtp),
            'domain': domain,
            'domain_user_present': bool(domain_user),
            'password_present': bool(password),
        },
        'connected': ACCOUNT is not None,
        'last_error': LAST_ERROR,
    }


def _probe_server(server):
    host = str(server or DEFAULT_SERVER).strip()
    if host.startswith('http://') or host.startswith('https://'):
        host = urlparse(host).hostname or host

    result = {
        'host': host,
        'dns': False,
        'tcp': False,
        'port': DEFAULT_EWS_PORT,
        'address': '',
        'error': '',
    }

    if not host:
        result['error'] = '服务器地址为空'
        return result

    try:
        address = socket.gethostbyname(host)
        result['dns'] = True
        result['address'] = address
    except Exception as exc:
        result['error'] = f'DNS 解析失败: {exc}'
        return result

    try:
        with socket.create_connection((host, DEFAULT_EWS_PORT), timeout=5):
            result['tcp'] = True
    except Exception as exc:
        result['error'] = f'{host}:{DEFAULT_EWS_PORT} 无法连接: {exc}'

    return result


def _message_key(item):
    return str(getattr(item, 'id', '') or '')


def _sender_text(item):
    sender = getattr(item, 'sender', None)
    if sender is None:
        return ''
    email = getattr(sender, 'email_address', None)
    name = getattr(sender, 'name', None)
    if name and email:
        return f'{name} <{email}>'
    return str(email or sender or '')


def _iso(value):
    if value is None:
        return None
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    return str(value)


def _body_text(item):
    body = getattr(item, 'text_body', None) or getattr(item, 'body', None) or ''
    return str(body)


def _summary(item):
    key = _message_key(item)
    MAIL_INDEX[key] = item
    received = getattr(item, 'datetime_received', None)
    subject = getattr(item, 'subject', '') or '(无主题)'
    preview = _body_text(item).replace('\r', ' ').replace('\n', ' ').strip()
    return {
        'id': key,
        'exchange_id': key,
        'changekey': getattr(item, 'changekey', None),
        'subject': subject,
        'sender': _sender_text(item),
        'preview': preview[:180],
        'body': preview,
        'datetime_received': _iso(received),
        'received_at': _iso(received),
        'is_read': 1 if getattr(item, 'is_read', False) else 0,
        'has_attachments': bool(getattr(item, 'attachments', None)),
        'importance': str(getattr(item, 'importance', '') or ''),
    }


def _list_mails(account, since=None, limit=50):
    from exchangelib import Q

    if since:
        try:
            start = datetime.fromisoformat(since.replace('Z', '+00:00'))
        except Exception:
            start = datetime.now(timezone.utc) - timedelta(days=7)
    else:
        start = datetime.now(timezone.utc) - timedelta(days=7)

    qs = account.inbox.filter(Q(datetime_received__gte=start)).order_by('-datetime_received')
    return [_summary(item) for item in qs[:limit]]


def _detail(account, mail_id):
    item = MAIL_INDEX.get(mail_id)
    if item is None:
        item = account.inbox.get(id=unquote(mail_id))
        MAIL_INDEX[mail_id] = item
    data = _summary(item)
    data['body'] = _body_text(item)
    data['html'] = str(getattr(item, 'body', '') or '')
    return data


class Handler(BaseHTTPRequestHandler):
    server_version = 'MailService/1.0'

    def log_message(self, fmt, *args):
        print('[MailService]', fmt % args, flush=True)

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            if parsed.path == '/health':
                _json(self, 200, {
                    'ok': True,
                    'connected': ACCOUNT is not None,
                    'error': LAST_ERROR,
                    'last_ok_at': LAST_OK_AT,
                })
                return
            if parsed.path == '/doctor':
                _json(self, 200, _doctor())
                return
            if parsed.path == '/mails':
                query = parse_qs(parsed.query)
                since = (query.get('since') or [None])[0]
                limit = int((query.get('limit') or ['50'])[0])
                _json(self, 200, _run_with_reconnect(_list_mails, since=since, limit=limit))
                return
            if parsed.path.startswith('/mail/'):
                mail_id = parsed.path[len('/mail/'):]
                _json(self, 200, _run_with_reconnect(_detail, mail_id))
                return
            _json(self, 404, {'ok': False, 'error': 'not found'})
        except Exception as exc:
            traceback.print_exc()
            _json(self, 500, {'ok': False, 'error': str(exc) or LAST_ERROR})

    def do_POST(self):
        global SERVER
        try:
            parsed = urlparse(self.path)
            if parsed.path == '/start':
                config = _read_body(self)
                _reset_account()
                _set_env(config)
                _account()
                _json(self, 200, {'ok': True})
                return
            if parsed.path == '/stop':
                _json(self, 200, {'ok': True})
                threading.Thread(target=_shutdown_soon, daemon=True).start()
                return
            _json(self, 404, {'ok': False, 'error': 'not found'})
        except Exception as exc:
            traceback.print_exc()
            _json(self, 500, {'ok': False, 'error': str(exc) or LAST_ERROR})


def _shutdown_soon():
    time.sleep(0.1)
    if SERVER:
        SERVER.shutdown()


def main():
    global SERVER
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9899
    SERVER = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'MailService listening on 127.0.0.1:{port}', flush=True)
    SERVER.serve_forever()


if __name__ == '__main__':
    main()
