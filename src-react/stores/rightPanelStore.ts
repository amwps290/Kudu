import { create } from 'zustand'
import { storage } from '@/utils/storage'
import type {
  RightPanelContext,
  RightPanelDbMessage,
  RightPanelId,
  RightPanelSettings,
} from '@/types/rightPanel'
import type { CellViewerData } from './cellViewerRegistry'

/**
 * 右侧面板 store（Zustand）。与 Pinia 版 stores/rightPanel.ts 同名成员逐一对齐；
 * Pinia 的持久化 watch 改为 setter 内同步执行（appStore 同款模式）。
 *
 * 与 Vue 版的唯一形态差异（迁移计划 4.4）：cellViewer 只存数据（CellViewerData），
 * 6 个操作回调移入 cellViewerRegistry（模块级 Map，不进 store）。
 *
 * 合约（红线 1/2.4）：`right_panel_settings` key 与格式不变，
 * 读取时保留旧面板 id 迁移（data→cell, info→output, properties→object）。
 */

const DEFAULT_SETTINGS: RightPanelSettings = {
  collapsed: false,
  width: 360,
  activePanelId: 'object',
  openedPanelIds: ['cell', 'output', 'object'],
}

function normalizePanelId(id: string): RightPanelId | null {
  if (id === 'cell' || id === 'output' || id === 'object') return id
  if (id === 'data') return 'cell'
  if (id === 'info') return 'output'
  if (id === 'properties') return 'object'
  return null
}

function loadInitialSettings(): RightPanelSettings {
  const saved = storage.get('right_panel_settings')
  const normalizedOpenedPanelIds = Array.isArray(saved?.openedPanelIds)
    ? saved.openedPanelIds.map((id) => normalizePanelId(String(id))).filter((id): id is RightPanelId => Boolean(id))
    : DEFAULT_SETTINGS.openedPanelIds
  const normalizedActivePanelId = normalizePanelId(String(saved?.activePanelId || '')) || DEFAULT_SETTINGS.activePanelId
  return {
    ...DEFAULT_SETTINGS,
    ...(saved || {}),
    activePanelId: normalizedActivePanelId,
    openedPanelIds: normalizedOpenedPanelIds.length > 0 ? normalizedOpenedPanelIds : DEFAULT_SETTINGS.openedPanelIds,
  }
}

interface RightPanelStoreState {
  collapsed: boolean
  width: number
  activePanelId: RightPanelId
  openedPanelIds: RightPanelId[]
  context: RightPanelContext | null
  cellViewer: CellViewerData | null
  dbMessages: RightPanelDbMessage[]

  setCollapsed(value: boolean): void
  toggleCollapsed(): void
  setWidth(value: number): void
  setActivePanel(id: RightPanelId): void
  setOpenedPanels(ids: RightPanelId[]): void
  setContext(value: RightPanelContext | null): void
  patchContext(value: Partial<RightPanelContext>): void
  setCellViewer(value: CellViewerData | null): void
  clearCellViewer(): void
  pushDbMessage(value: RightPanelDbMessage): void
  clearDbMessages(): void
}

export const useRightPanelStore = create<RightPanelStoreState>()((set, get) => {
  const initial = loadInitialSettings()

  function persistSettings() {
    const { collapsed, width, activePanelId, openedPanelIds } = get()
    storage.set('right_panel_settings', { collapsed, width, activePanelId, openedPanelIds })
  }

  return {
    collapsed: initial.collapsed,
    width: initial.width,
    activePanelId: initial.activePanelId,
    openedPanelIds: initial.openedPanelIds,
    context: null,
    cellViewer: null,
    dbMessages: [],

    setCollapsed(value) {
      set({ collapsed: value })
      persistSettings()
    },

    toggleCollapsed() {
      set({ collapsed: !get().collapsed })
      persistSettings()
    },

    setWidth(value) {
      set({ width: Math.min(560, Math.max(280, value)) })
      persistSettings()
    },

    setActivePanel(id) {
      const opened = get().openedPanelIds.includes(id)
        ? get().openedPanelIds
        : [...get().openedPanelIds, id]
      set({ openedPanelIds: opened, activePanelId: id, collapsed: false })
      persistSettings()
    },

    setOpenedPanels(ids) {
      const openedPanelIds = ids.length ? ids : DEFAULT_SETTINGS.openedPanelIds
      const activePanelId = openedPanelIds.includes(get().activePanelId)
        ? get().activePanelId
        : openedPanelIds[0]
      set({ openedPanelIds, activePanelId })
      persistSettings()
    },

    setContext(value) {
      set({ context: value })
    },

    patchContext(value) {
      set({ context: { ...(get().context || {}), ...value } })
    },

    setCellViewer(value) {
      set({ cellViewer: value })
    },

    clearCellViewer() {
      set({ cellViewer: null })
    },

    pushDbMessage(value) {
      const next = [value, ...get().dbMessages]
      set({ dbMessages: next.length > 500 ? next.slice(0, 500) : next })
    },

    clearDbMessages() {
      set({ dbMessages: [] })
    },
  }
})
