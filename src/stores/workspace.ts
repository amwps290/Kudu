import { defineStore } from 'pinia'
import { ref } from 'vue'
import { workspaceApi, type RawSessionState } from '@/api/workspace'
import { withErrorHandler } from '@/utils/errorHandler'
import { TabType, type TabState } from '@/types/workspace'

export type { TabState }

const SESSION_PERSISTABLE_TAB_TYPES = new Set<TabType>([
  TabType.Query,
  TabType.Redis,
  TabType.Data,
  TabType.Design,
  TabType.Builder,
  TabType.Compare,
  TabType.Settings,
])

function toRawSessionState(tabs: TabState[], activeKey: string): RawSessionState {
  const persistableTabs = tabs.filter(tab => SESSION_PERSISTABLE_TAB_TYPES.has(tab.type))
  const fallbackActiveKey = persistableTabs.some(tab => tab.key === activeKey)
    ? activeKey
    : (persistableTabs[0]?.key || '')

  return {
    open_tabs: persistableTabs.map(tab => ({
      key: tab.key,
      title: tab.title,
      type: tab.type,
      connection_id: tab.connectionId,
      database: tab.database,
      schema: tab.schema,
      table: tab.table,
      content: tab.content,
      file_path: tab.filePath,
      read_only: tab.readOnly,
      is_untitled: tab.isUntitled,
    })),
    active_tab_key: fallbackActiveKey,
  }
}

function fromRawSessionState(session: RawSessionState): { open_tabs: TabState[], active_tab_key: string } {
  const openTabs = session.open_tabs.map((tab) => ({
    key: tab.key,
    title: tab.title,
    type: tab.type as TabType,
    connectionId: tab.connection_id,
    database: tab.database,
    schema: tab.schema,
    table: tab.table,
    content: tab.content,
    filePath: tab.file_path,
    readOnly: tab.read_only,
    dirty: false,
    isUntitled: tab.is_untitled,
  }))

  return {
    open_tabs: openTabs,
    active_tab_key: openTabs.some(tab => tab.key === session.active_tab_key)
      ? session.active_tab_key
      : (openTabs[0]?.key || ''),
  }
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const isRestoring = ref(false)

  async function saveSession(tabs: TabState[], activeKey: string) {
    if (isRestoring.value) return
    await workspaceApi.saveSession(toRawSessionState(tabs, activeKey))
  }

  async function loadSession(): Promise<{ open_tabs: TabState[], active_tab_key: string } | null> {
    const result = await withErrorHandler(async () => {
      const session = await workspaceApi.loadSession()
      if (!session) return null
      return fromRawSessionState(session)
    }, { messagePrefix: '加载工作区会话失败' })

    return result || null
  }

  return {
    isRestoring,
    saveSession,
    loadSession,
  }
})
