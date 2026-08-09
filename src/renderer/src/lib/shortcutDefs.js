// 快捷键元数据：分组、标签、描述、默认值、作用域
// 作用域 scope: 'global' = 系统级全局快捷键；'window' = 仅主窗口聚焦时生效

export const SHORTCUT_GROUPS = [
  {
    id: 'window',
    label: '窗口控制',
    items: [
      {
        id: 'toggle-window',
        label: '切换窗口显示',
        description: '显示或隐藏主窗口',
        default: 'F3',
        scope: 'global'
      },
      {
        id: 'hide-window',
        label: '隐藏窗口',
        description: '关闭主窗口（窗口内有效）',
        default: 'Escape',
        scope: 'window'
      },
      {
        id: 'toggle-passthrough',
        label: '鼠标穿透',
        description: '切换穿透模式，开启后点击会穿透窗口',
        default: 'Ctrl+Shift+P',
        scope: 'global'
      }
    ]
  },
  {
    id: 'category',
    label: '分类切换',
    items: [
      { id: 'category-全部', label: '全部', description: '显示全部分类', default: 'Alt+1', scope: 'window' },
      { id: 'category-工作', label: '工作', description: '切换到工作分类', default: 'Alt+2', scope: 'window' },
      { id: 'category-生活', label: '生活', description: '切换到生活分类', default: 'Alt+3', scope: 'window' },
      { id: 'category-学习', label: '学习', description: '切换到学习分类', default: 'Alt+4', scope: 'window' },
      { id: 'category-会议', label: '会议', description: '切换到会议分类', default: 'Alt+5', scope: 'window' },
      { id: 'category-其他', label: '其他', description: '切换到其他分类', default: 'Alt+6', scope: 'window' }
    ]
  }
]

export const ALL_SHORTCUT_ITEMS = SHORTCUT_GROUPS.flatMap((group) => group.items)

export const DEFAULT_SHORTCUTS = ALL_SHORTCUT_ITEMS.reduce((acc, item) => {
  acc[item.id] = item.default
  return acc
}, {})

export const SHORTCUT_LABELS = ALL_SHORTCUT_ITEMS.reduce((acc, item) => {
  acc[item.id] = item.label
  return acc
}, {})
