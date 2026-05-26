import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'
import type {
  RightPanelCellViewerState,
  RightPanelContext,
  RightPanelDbMessage,
  RightPanelId,
  RightPanelSettings,
} from '@/types/rightPanel'

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

export const useRightPanelStore = defineStore('right-panel', () => {
  const saved = storage.get('right_panel_settings')
  const normalizedOpenedPanelIds = Array.isArray(saved?.openedPanelIds)
    ? saved.openedPanelIds.map(id => normalizePanelId(String(id))).filter((id): id is RightPanelId => Boolean(id))
    : DEFAULT_SETTINGS.openedPanelIds
  const normalizedActivePanelId = normalizePanelId(String(saved?.activePanelId || '')) || DEFAULT_SETTINGS.activePanelId
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(saved || {}),
    activePanelId: normalizedActivePanelId,
    openedPanelIds: normalizedOpenedPanelIds.length > 0 ? normalizedOpenedPanelIds : DEFAULT_SETTINGS.openedPanelIds,
  }

  const collapsed = ref(settings.collapsed)
  const width = ref(settings.width)
  const activePanelId = ref<RightPanelId>(settings.activePanelId)
  const openedPanelIds = ref<RightPanelId[]>(settings.openedPanelIds)
  const context = ref<RightPanelContext | null>(null)
  const cellViewer = ref<RightPanelCellViewerState | null>(null)
  const dbMessages = ref<RightPanelDbMessage[]>([])

  const isOpen = computed(() => !collapsed.value)

  watch(
    [collapsed, width, activePanelId, openedPanelIds],
    () => {
      storage.set('right_panel_settings', {
        collapsed: collapsed.value,
        width: width.value,
        activePanelId: activePanelId.value,
        openedPanelIds: openedPanelIds.value,
      })
    },
    { deep: true }
  )

  function setCollapsed(value: boolean) {
    collapsed.value = value
  }

  function toggleCollapsed() {
    collapsed.value = !collapsed.value
  }

  function setWidth(value: number) {
    width.value = Math.min(560, Math.max(280, value))
  }

  function setActivePanel(id: RightPanelId) {
    if (!openedPanelIds.value.includes(id)) {
      openedPanelIds.value = [...openedPanelIds.value, id]
    }
    activePanelId.value = id
    collapsed.value = false
  }

  function setOpenedPanels(ids: RightPanelId[]) {
    openedPanelIds.value = ids.length ? ids : DEFAULT_SETTINGS.openedPanelIds
    if (!openedPanelIds.value.includes(activePanelId.value)) {
      activePanelId.value = openedPanelIds.value[0]
    }
  }

  function setContext(value: RightPanelContext | null) {
    context.value = value
  }

  function patchContext(value: Partial<RightPanelContext>) {
    context.value = {
      ...(context.value || {}),
      ...value,
    }
  }

  function setCellViewer(value: RightPanelCellViewerState | null) {
    cellViewer.value = value
  }

  function clearCellViewer() {
    cellViewer.value = null
  }

  function pushDbMessage(value: RightPanelDbMessage) {
    dbMessages.value.unshift(value)
    if (dbMessages.value.length > 500) {
      dbMessages.value = dbMessages.value.slice(0, 500)
    }
  }

  function clearDbMessages() {
    dbMessages.value = []
  }

  return {
    collapsed,
    width,
    activePanelId,
    openedPanelIds,
    context,
    isOpen,
    cellViewer,
    dbMessages,
    setCollapsed,
    toggleCollapsed,
    setWidth,
    setActivePanel,
    setOpenedPanels,
    setContext,
    patchContext,
    setCellViewer,
    clearCellViewer,
    pushDbMessage,
    clearDbMessages,
  }
})
