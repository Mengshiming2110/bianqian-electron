# 便签 (Bianqian)

悬浮桌面便签应用 — 无主窗口，系统托盘驱动，毛玻璃透明界面。

## 功能

- **云游窗口** — 280×500 悬浮窗，右上角常驻，隐藏而非关闭
- **鼠标穿透** — 默认穿透，悬停 200ms 激活，离开 1.5s 恢复；硬穿透模式完全不接收鼠标
- **透明度调节** — 35%-100% 滑杆
- **便签管理** — 新建/编辑/删除，分类筛选（工作/生活/学习/会议/其他），全文搜索
- **提醒系统** — 定时检查，到时 Web Notification 提醒
- **文件附件** — 多选添加，点击打开
- **系统托盘** — 左键切换窗口，右键菜单含分类计数和穿透开关
- **全局快捷键** — `F3` 切换显示

## 技术栈

Electron 33 · Vue 3 · Pinia · electron-vite · electron-store · lucide-vue-next · electron-builder (NSIS)

## 快速开始

```bash
npm install
npm run dev      # 开发模式
npm run build    # 编译
npm run dist     # 打包 NSIS 安装包
```

## 下载

[GitHub Releases](https://github.com/Mengshiming2110/bianqian-electron/releases)

## 项目结构

```
src/
├── main/               # 主进程
│   ├── index.js        # 入口，生命周期
│   ├── window-manager.js  # 窗口 + 穿透 + 透明度
│   ├── tray.js         # 系统托盘
│   ├── store.js        # electron-store 持久化
│   ├── ipc.js          # IPC 桥接
│   ├── shortcuts.js    # 快捷键
│   └── categories.js   # 分类常量
├── preload/
│   └── index.js        # contextBridge API
└── renderer/
    └── src/
        ├── App.vue     # 主界面
        ├── stores/notes.js  # Pinia Store
        └── assets/styles/   # CSS 变量主题
```

## 已知问题

electron-builder asar integrity 步骤会损坏 exe 二进制，当前通过 `asar: false` 绕过。详见 [SPEC.md](SPEC.md)。
