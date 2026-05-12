import { nextTick, type ComputedRef, type Ref } from 'vue'
import { message } from '@/ui/antd'
import { TabType } from '@/types/workspace'
import type { DataTab } from '@/composables/useTabManager'
import { supportsDataCompare, supportsQueryBuilder } from '@/utils/databaseSupport'
import type { ReturnTypeUseConnectionStore } from '@/types/internal'

export interface TableEventData {
  connectionId?: string
  database?: string
  table?: string
  schema?: string
  metadata?: { schema?: string }
}

export interface QueryEventData {
  connectionId?: string
  database?: string
  filePath?: string
  title?: string
  content?: string
}

export interface DatabaseEventData {
  connectionId?: string
  name?: string
}

export interface QueryBuilderExecutePayload {
  sql: string
  database?: string
}

interface WorkspaceTabActionsOptions {
  connectionStore: ReturnTypeUseConnectionStore
  dataTabs: Ref<DataTab[]>
  mainTabKey: Ref<string>
  activeTabType: Ref<TabType | undefined>
  activeTabDatabase: Ref<string>
  isSqlSupported: ComputedRef<boolean>
  redisEditorRef: Ref<unknown>
  t: (key: string, options?: Record<string, unknown>) => string
  tabExists: (key: string) => boolean
  addTab: (tab: DataTab) => void
}

export function useWorkspaceTabActions(options: WorkspaceTabActionsOptions) {
  function generateNextScriptTitle() {
    const used = new Set(
      options.dataTabs.value
        .map(tab => /^script-(\d+)\.sql$/i.exec(tab.title)?.[1])
        .filter((value): value is string => Boolean(value))
        .map(value => Number(value))
        .filter(value => Number.isInteger(value) && value > 0)
    )

    let index = 1
    while (used.has(index)) index += 1
    return `script-${index}.sql`
  }

  function handleTableSelected(data: TableEventData) {
    const connectionId = data.connectionId || options.connectionStore.activeConnectionId
    const key = `table-${connectionId}-${data.database}-${data.table}`
    if (options.tabExists(key)) {
      options.mainTabKey.value = key
      return
    }

    options.addTab({
      key,
      title: data.table || '',
      type: TabType.Data,
      connectionId: connectionId!,
      database: data.database,
      table: data.table,
      schema: data.schema || data.metadata?.schema,
    })
  }

  async function handleDatabaseSelected(data: DatabaseEventData) {
    if (data.connectionId) {
      options.connectionStore.setActiveConnection(data.connectionId)
    }

    if (!options.isSqlSupported.value) {
      if (options.connectionStore.getActiveConnection()?.db_type === 'redis') {
        if (!options.tabExists('redis')) {
          options.addTab({ key: 'redis', title: 'Redis 命令行', type: TabType.Redis, closable: false })
        }
        options.mainTabKey.value = 'redis'
        await nextTick()
        window.setTimeout(() => {
          ;(options.redisEditorRef.value as { switchDatabase?: (db: string) => void } | undefined)?.switchDatabase?.(data.name || '')
        }, 100)
      }
    }
  }

  async function handleNewQuery(data: QueryEventData) {
    if (!options.isSqlSupported.value) return

    const connectionId = data.connectionId || options.connectionStore.activeConnectionId
    let database = data.database
    if (connectionId && !database) {
      const connection = options.connectionStore.connections.find(item => item.id === connectionId)
      if (connection?.db_type === 'sqlite') {
        database = 'main'
      }
    }

    if (data.filePath) {
      const existingTab = options.dataTabs.value.find(tab => tab.type === TabType.Query && tab.filePath === data.filePath)
      if (existingTab) {
        options.mainTabKey.value = existingTab.key
        return
      }
    }

    const key = `query-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    options.addTab({
      key,
      title: data.title || generateNextScriptTitle(),
      type: TabType.Query,
      connectionId: connectionId || undefined,
      database,
      content: data.content || '',
      filePath: data.filePath,
      dirty: false,
    })
  }

  function handleOpenSavedScript(data: QueryEventData) {
    void handleNewQuery(data)
  }

  function handleGeneratedSql(data: { sql: string; database: string; connectionId: string }) {
    void handleNewQuery({
      connectionId: data.connectionId,
      database: data.database,
      content: data.sql,
    })
  }

  function handleViewStructure(data: TableEventData) {
    const key = `structure-${data.connectionId}-${data.database}-${data.table}`
    if (options.tabExists(key)) {
      options.mainTabKey.value = key
      return
    }

    options.addTab({
      key,
      title: `${options.t('common.file')}: ${data.table}`,
      type: TabType.Design,
      connectionId: data.connectionId,
      database: data.database,
      table: data.table,
      schema: data.schema,
      readOnly: true,
    })
  }

  function handleDesignTable(data: TableEventData) {
    const key = `design-${data.connectionId}-${data.database}-${data.table}`
    if (options.tabExists(key)) {
      options.mainTabKey.value = key
      return
    }

    options.addTab({
      key,
      title: `${options.t('tree.design_table')}: ${data.table}`,
      type: TabType.Design,
      connectionId: data.connectionId,
      database: data.database,
      table: data.table,
      schema: data.schema,
      readOnly: false,
    })
  }

  function handleOpenQueryBuilder() {
    const activeConnection = options.connectionStore.getActiveConnection()
    if (!activeConnection?.id) {
      message.warning(options.t('tools.query_builder.require_connection'))
      return
    }

    if (!supportsQueryBuilder(activeConnection.db_type)) {
      message.warning(options.t('tools.query_builder.unsupported_connection'))
      return
    }

    const key = `builder-${activeConnection.id}`
    if (options.tabExists(key)) {
      options.mainTabKey.value = key
      return
    }

    options.addTab({
      key,
      title: options.t('tools.query_builder.title'),
      type: TabType.Builder,
      connectionId: activeConnection.id,
      database: options.activeTabType.value === TabType.Query ? options.activeTabDatabase.value : activeConnection.database,
    })
  }

  function handleQueryBuilderExecute(tab: DataTab, payload: QueryBuilderExecutePayload | string) {
    const sql = typeof payload === 'string' ? payload : payload.sql
    const database = typeof payload === 'string' ? tab.database : payload.database || tab.database
    void handleNewQuery({
      connectionId: tab.connectionId,
      database,
      content: sql,
    })
  }

  function handleOpenDataCompare() {
    const activeConnection = options.connectionStore.getActiveConnection()
    if (!activeConnection?.id) {
      message.warning(options.t('tools.data_compare.require_connection'))
      return
    }

    if (!supportsDataCompare(activeConnection.db_type)) {
      message.warning(options.t('tools.data_compare.unsupported_connection'))
      return
    }

    const key = `compare-${activeConnection.id}`
    if (options.tabExists(key)) {
      options.mainTabKey.value = key
      return
    }

    options.addTab({
      key,
      title: options.t('tools.data_compare.title'),
      type: TabType.Compare,
      connectionId: activeConnection.id,
      database: options.activeTabType.value === TabType.Query ? options.activeTabDatabase.value : activeConnection.database,
    })
  }

  function getConnectionColor(connectionId?: string) {
    if (!connectionId) return ''
    return options.connectionStore.connections.find(connection => connection.id === connectionId)?.color || ''
  }

  return {
    handleTableSelected,
    handleDatabaseSelected,
    handleNewQuery,
    handleOpenSavedScript,
    handleGeneratedSql,
    handleViewStructure,
    handleDesignTable,
    handleOpenQueryBuilder,
    handleQueryBuilderExecute,
    handleOpenDataCompare,
    getConnectionColor,
  }
}
