/**
 * cellViewer 动作注册表（迁移计划 4.4：唯一需要换形态的状态）。
 *
 * Vue 版把 6 个回调闭包直接存进 rightPanel store（函数进响应式状态）；
 * React/Zustand 下闭包捕获旧 state 的风险在不可变模型下被放大，故拆分为：
 * - store 只存**数据**（CellViewerData，含 ownerId）；
 * - 动作存本模块级 Map（不进 store），TableDataGrid 挂载时注册、卸载时注销，
 *   CellViewerPanel 按 ownerId 取 handlers 反调。数据流向与 Vue 版一致。
 */

export interface CellViewerData {
  /** 动作注册方标识（如 TableDataGrid 的 tab key） */
  ownerId: string
  columnTitle: string
  field: string
  rowLabel?: string
  value: string
  isNull: boolean
  readOnly: boolean
  objectName?: string
}

export interface CellViewerActions {
  onChange?: (value: string) => void
  onToggleNull?: (checked: boolean) => void
  onFormatJson?: () => void
  onCopyCell?: () => void
  onCopyRowJson?: () => void
  onCopyRowInsert?: () => void
}

const registry = new Map<string, CellViewerActions>()

export function registerCellViewerActions(ownerId: string, actions: CellViewerActions) {
  registry.set(ownerId, actions)
}

export function unregisterCellViewerActions(ownerId: string) {
  registry.delete(ownerId)
}

export function getCellViewerActions(ownerId: string): CellViewerActions | null {
  return registry.get(ownerId) ?? null
}
