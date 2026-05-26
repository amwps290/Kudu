import { ref, type Ref } from 'vue'
import type { ConnectionConfig } from '@/types/database'
import { TabType } from '@/types/workspace'
import type { DataTab } from '@/composables/useTabManager'

interface WorkspaceViewActionsOptions {
  mainTabKey: Ref<string>
  tabExists: (key: string) => boolean
  addTab: (tab: DataTab) => void
  t: (key: string, options?: Record<string, unknown>) => string
}

export function useWorkspaceViewActions(options: WorkspaceViewActionsOptions) {
  const showConnectionDialog = ref(false)
  const showGlobalSearch = ref(false)
  const editingConnection = ref<ConnectionConfig | null>(null)

  function openConnectionDialog() {
    showConnectionDialog.value = true
  }

  function openGlobalSearch() {
    showGlobalSearch.value = true
  }

  function openSettings() {
    const key = 'settings'
    if (options.tabExists(key)) {
      options.mainTabKey.value = key
      return
    }

    options.addTab({
      key,
      title: options.t('common.settings'),
      type: TabType.Settings,
    })
  }

  function openErDiagram(connectionId?: string, database?: string, table?: string, schema?: string) {
    if (!connectionId || !table) return
    const key = `er-${connectionId}-${database || ''}-${schema || ''}-${table}`
    if (options.tabExists(key)) {
      options.mainTabKey.value = key
      return
    }

    options.addTab({
      key,
      title: options.t('tools.er_diagram.title'),
      type: TabType.ErDiagram,
      connectionId,
      database,
      table,
      schema,
    })
  }

  function handleEditConnection(connection: ConnectionConfig) {
    editingConnection.value = connection
    showConnectionDialog.value = true
  }

  function handleConnectionDialogClose() {
    editingConnection.value = null
  }

  return {
    showConnectionDialog,
    showGlobalSearch,
    editingConnection,
    openConnectionDialog,
    openGlobalSearch,
    openSettings,
    openErDiagram,
    handleEditConnection,
    handleConnectionDialogClose,
  }
}
