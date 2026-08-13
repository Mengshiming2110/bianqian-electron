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
LAST_FETCH_OK_AT = None
LAST_FETCH_ERROR = ''
MAIL_INDEX = {}
SERVER = None
MAIL_ENV_KEYS = {'MAIL_SMTP', 'MAIL_DOMAIN_USER', 'MAIL_PASS', 'MAIL_DOMAIN', 'MAIL_SERVER'}
SKILL_ALIASES = ('ly_outlook_mail', '领益Outlook邮件', '领益 Outlook 邮件', 'ly-outlook', 'ly-outlook-mail')
DEFAULT_DOMAIN = 'LSTECH'
DEFAULT_SERVER = 'mail.lingyiitech.com'
DEFAULT_EWS_PORT = 443

# 网络抖动自愈参数
EWS_TIMEOUT_SECONDS = 20        # 单次 EWS 请求超时
EWS_QUICK_TIMEOUT_SECONDS = 8   # 诊断模式认证测试的超时
RECONNECT_COOLDOWN_SECONDS = 10  # 连接失效后重建账号的冷却期，避免断网时高频重连

VERSION = '1.2.2'


def _json(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False, default=str).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Content-Length', str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _check_token(handler):
    """Zcode/外部调用令牌：桥接层通过 MAIL_SERVICE_TOKEN 环境变量下发，
    请求需带 X-Mail-Token 头；环境变量未设置（裸跑开发）时不鉴权。"""
    expected = os.getenv('MAIL_SERVICE_TOKEN')
    if not expected:
        return True
    return handler.headers.get('X-Mail-Token') == expected


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
    global ACCOUNT, LAST_ERROR, MAIL_INDEX, ACCOUNT_CREATED_AT, LAST_OK_AT, LAST_FETCH_OK_AT, LAST_FETCH_ERROR
    with ACCOUNT_LOCK:
        ACCOUNT = None
        ACCOUNT_CREATED_AT = None
        LAST_ERROR = ''
        LAST_OK_AT = None
        LAST_FETCH_OK_AT = None
        LAST_FETCH_ERROR = ''
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
    """判断是否为瞬时网络/服务错误（可重连重试）。

    - 认证类错误（UnauthorizedError）永远不算瞬时，避免用坏密码反复轰炸服务器；
    - EWS 业务错误（ResponseMessageError，全部继承自 TransportError）只有命中明确的可重试
      错误码（服务器忙/内部瞬时错误/连接失败/超时/邮箱存储故障等）才算瞬时，
      其余（ItemNotFound/AccessDenied 等永久错误）不做无谓重连；
    - 传输层 TransportError / RateLimitError / RedirectError 与 socket 类异常视为瞬时。

    懒加载 exchangelib 错误类型：exchangelib 缺失时（/doctor 场景）退化为消息关键字判断。
    """
    global _TRANSIENT_ERROR_TYPES, _NON_TRANSIENT_ERROR_TYPES, _RETRYABLE_RESPONSE_TYPES, _RESPONSE_ERROR_TYPE
    if _TRANSIENT_ERROR_TYPES is None:
        try:
            from exchangelib.errors import (
                ResponseMessageError,
                ErrorServerBusy,
                ErrorInternalServerTransientError,
                ErrorInternalServerError,
                ErrorConnectionFailed,
                ErrorConnectionFailedTransientError,
                ErrorTimeoutExpired,
                ErrorClientDisconnected,
                ErrorMailboxStoreUnavailable,
                ErrorMailboxFailover,
                ErrorNoRespondingCASInDestinationSite,
                ErrorNoApplicableProxyCASServersAvailable,
                ErrorExceededConnectionCount,
                ErrorNotEnoughMemory,
                ErrorRequestAborted,
                ErrorProxyRequestProcessingFailed,
                RateLimitError,
                RedirectError,
                TransportError,
                UnauthorizedError,
            )
            # EWS 业务响应错误中明确可重试的错误码（连不上/超时/服务器忙/邮箱存储故障等）
            _RETRYABLE_RESPONSE_TYPES = (
                ErrorServerBusy, ErrorInternalServerTransientError,
                ErrorInternalServerError, ErrorConnectionFailed,
                ErrorConnectionFailedTransientError, ErrorTimeoutExpired,
                ErrorClientDisconnected, ErrorMailboxStoreUnavailable,
                ErrorMailboxFailover, ErrorNoRespondingCASInDestinationSite,
                ErrorNoApplicableProxyCASServersAvailable, ErrorExceededConnectionCount,
                ErrorNotEnoughMemory, ErrorRequestAborted,
                ErrorProxyRequestProcessingFailed,
            )
            _RESPONSE_ERROR_TYPE = ResponseMessageError
            # 传输层异常（非业务响应）一律视为瞬时
            _TRANSIENT_ERROR_TYPES = (RateLimitError, RedirectError, TransportError)
            _NON_TRANSIENT_ERROR_TYPES = (UnauthorizedError,)
        except Exception:
            _RETRYABLE_RESPONSE_TYPES = ()
            _RESPONSE_ERROR_TYPE = None
            _TRANSIENT_ERROR_TYPES = ()
            _NON_TRANSIENT_ERROR_TYPES = ()
    if isinstance(exc, _NON_TRANSIENT_ERROR_TYPES):
        return False
    if _RESPONSE_ERROR_TYPE is not None and isinstance(exc, _RESPONSE_ERROR_TYPE):
        # 业务错误只认明确的可重试错误码，其余按永久错误处理
        return isinstance(exc, _RETRYABLE_RESPONSE_TYPES)
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
    """请求级自愈：瞬时故障时作废账号并重试一次（冷却期内直接抛错，由调用方处理）。

    同时记录最近一次 EWS 拉取的健康状态（LAST_FETCH_OK_AT / LAST_FETCH_ERROR），
    供 /health 与状态文件报告——连接对象存在不代表拉取真的可用。
    """
    global LAST_FETCH_ERROR, LAST_FETCH_OK_AT
    try:
        result = fn(_account(), *args, **kwargs)
        _mark_ok()
        LAST_FETCH_OK_AT = datetime.now(timezone.utc).isoformat()
        LAST_FETCH_ERROR = ''
        return result
    except Exception as exc:
        if not _is_transient(exc):
            LAST_FETCH_ERROR = f'{type(exc).__name__}: {exc}'
            raise
        _invalidate_account(str(exc))
        try:
            result = fn(_account(), *args, **kwargs)
            _mark_ok()
            LAST_FETCH_OK_AT = datetime.now(timezone.utc).isoformat()
            LAST_FETCH_ERROR = ''
            return result
        except Exception as exc2:
            LAST_FETCH_ERROR = f'{type(exc2).__name__}: {exc2}'
            raise


def _account(quick=False):
    global ACCOUNT, LAST_ERROR, ACCOUNT_CREATED_AT
    with ACCOUNT_LOCK:
        if not quick:
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
            from exchangelib.protocol import BaseProtocol, FailFast

            # 统一 FailFast：服务器忙/超时等错误立刻浮出，由 _run_with_reconnect 做一次
            # 「作废账号+重建+重试」，JS 桥再做快速重试与服务重启。FaultTolerance 的内部指数退避
            # （10s→160s）会把每个请求卡住数分钟，反而让拉取看起来死掉。
            # TIMEOUT 是类属性且按请求实时读取，必须保存/恢复，避免诊断污染后续正常拉取
            previous_timeout = BaseProtocol.TIMEOUT
            try:
                BaseProtocol.TIMEOUT = EWS_QUICK_TIMEOUT_SECONDS if quick else EWS_TIMEOUT_SECONDS
                credentials = Credentials(username=f'{domain}\\{domain_user}', password=password)
                config = Configuration(
                    server=server,
                    credentials=credentials,
                    retry_policy=FailFast(),
                )
                account = Account(
                    primary_smtp_address=smtp,
                    config=config,
                    autodiscover=False,
                    access_type=DELEGATE,
                )
                # 先验证再赋值：认证失败时不能把坏账号挂到全局，否则 connected 误报且后续请求全走死连接
                _ = account.inbox.name
            finally:
                BaseProtocol.TIMEOUT = previous_timeout

            # 诊断模式：只做认证测试，不替换全局账号（FailFast/短超时账号不能用于常规拉取）
            if quick:
                LAST_ERROR = ''
                return account
            ACCOUNT = account
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

    # 真实认证测试：quick 模式短超时 + FailFast，只测一次不拖长诊断
    ews = {'ok': False, 'error': '', 'elapsed_ms': 0}
    config_complete = bool(smtp and domain_user and password)
    if not config_complete:
        ews['error'] = '配置不完整，跳过认证测试'
    elif not network.get('tcp'):
        ews['error'] = '网络不可达，跳过认证测试'
    else:
        started = time.time()
        try:
            _account(quick=True)
            ews = {'ok': True, 'elapsed_ms': int((time.time() - started) * 1000)}
        except Exception as exc:
            ews = {'ok': False, 'error': str(exc), 'elapsed_ms': int((time.time() - started) * 1000)}

    # 可执行修复建议（action 供调用方触发，label 供界面展示）
    fixes = []
    if not config_complete:
        fixes.append({'action': 'config', 'label': '补齐邮箱地址、AD 账号和密码'})
    if not network.get('dns'):
        fixes.append({'action': 'network', 'label': 'DNS 解析失败，请检查服务器地址与公司网络/VPN'})
    elif not network.get('tcp'):
        fixes.append({'action': 'network', 'label': f'无法连接 {network.get("host", server)}:{DEFAULT_EWS_PORT}，请检查网络/VPN'})
    elif not ews.get('ok'):
        fixes.append({'action': 'credentials', 'label': '核对 AD 账号/密码与域账号格式后重新连接'})
        fixes.append({'action': 'reconnect', 'label': '重新连接 Exchange'})

    return {
        'ok': exchangelib_ok and network.get('tcp') and config_complete and ews.get('ok'),
        'version': VERSION,
        'probed_at': datetime.now(timezone.utc).isoformat(),
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
        'ews': ews,
        'fixes': fixes,
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
    from exchangelib.fields import FieldOrder
    from exchangelib.folders import FolderCollection

    if since:
        try:
            start = datetime.fromisoformat(since.replace('Z', '+00:00'))
        except Exception:
            start = datetime.now(timezone.utc) - timedelta(days=7)
    else:
        start = datetime.now(timezone.utc) - timedelta(days=7)

    # 用低层 API 显式捕获被 exchangelib 静默吞掉的响应级错误：
    # 高层 filter() 会把 FindItem/GetItem 的服务器错误过滤成空列表，
    # 导致「服务器拒绝查询」被伪装成「没有新邮件」。
    folder = account.inbox
    ids = list(FolderCollection(account=account, folders=[folder]).find_items(
        q=Q(datetime_received__gte=start),
        shape='IdOnly',
        order_fields=[FieldOrder.from_string(field_path='-datetime_received', folder=folder)],
        page_size=limit,
        max_items=limit,
    ))
    id_errors = [i for i in ids if isinstance(i, Exception)]
    if id_errors:
        # 原样抛出 exchangelib 异常，让 _run_with_reconnect 按错误类型分类（瞬时重试 / 永久上报）
        raise id_errors[0]

    items = list(account.fetch(ids=ids, only_fields=None))
    ok_items = [i for i in items if not isinstance(i, Exception)]
    error_items = [i for i in items if isinstance(i, Exception)]
    if error_items and not ok_items:
        raise error_items[0]
    return [_summary(item) for item in ok_items]


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
        if not _check_token(self):
            _json(self, 401, {'ok': False, 'error': 'unauthorized'})
            return
        try:
            parsed = urlparse(self.path)
            if parsed.path == '/health':
                _json(self, 200, {
                    'ok': True,
                    'version': VERSION,
                    'connected': ACCOUNT is not None,
                    'error': LAST_ERROR,
                    'last_ok_at': LAST_OK_AT,
                    'fetch_ok_at': LAST_FETCH_OK_AT,
                    'fetch_error': LAST_FETCH_ERROR,
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
            _json(self, 500, {'ok': False, 'error': f'{type(exc).__name__}: {str(exc) or LAST_ERROR}'})

    def do_POST(self):
        if not _check_token(self):
            _json(self, 401, {'ok': False, 'error': 'unauthorized'})
            return
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
            _json(self, 500, {'ok': False, 'error': f'{type(exc).__name__}: {str(exc) or LAST_ERROR}'})


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
