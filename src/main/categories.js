export const CATEGORIES = ['工作', '生活', '学习', '会议', '其他']
export const ALL_CATEGORY = '全部'

export function normalizeCategory(category) {
  return CATEGORIES.includes(category) ? category : '其他'
}
