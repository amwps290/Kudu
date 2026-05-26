import { nextTick, type ComputedRef, type Ref } from 'vue'
import { message } from '@/ui/antd'
import { TabType } from '@/types/workspace'
import type { RightPanelObjectType } from '@/types/rightPanel'
import type { DataTab } from '@/composables/useTabManager'
import { supportsDataCompare, supportsQueryBuilder } from '@/utils/databaseSupport'
import type { ReturnTypeUseConnectionStore } from '@/types/internal'
import type { SqlDocumentInput } from '@/composables/useSqlDocumentActions'

export interface TableEventData {
  connectionId?: string
  database?: string
  table?: string
  schema?: string
  metadata?: { schema?: string }
  designTab?: 'columns' | 'indexes' | 'foreign_keys' | 'ddl'
  designAction?: 'add_column' | 'add_index' | 'add_foreign_key'
}

export interface QueryEventData {
  connectionId?: string
  database?: string
  filePath?: string
  title?: string
  content?: string
  autoExecuteNonce?: string
}

export interface DatabaseEventData {
  connectionId?: string
  name?: string
}

export interface ObjectSelectedEventData {
  connectionId?: string
  type?: string
  title?: string
  metadata?: Record<string, unknown>
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
  openOrCreateQueryTab: (data: SqlDocumentInput) => Promise<boolean>
  onInspectObject?: (data: {
    connectionId?: string
    database?: string
    schema?: string
    objectName?: string
    objectType?: RightPanelObjectType
    tabKey?: string
    tabType?: string
    readOnly?: boolean
    metadata?: Record<string, unknown>
  }) => void
}

export function useWorkspaceTabActions(options: WorkspaceTabActionsOptions) {
  function handleObjectSelected(data: ObjectSelectedEventData) {
    const metadata = data.metadata || {}
    const objectType = ((): RightPanelObjectType | undefined => {
      if (data.type === 'database') return 'database'
      if (data.type === 'schema') return 'schema'
      if (data.type === 'table') return 'table'
      if (data.type === 'view') return 'view'
      if (data.type === 'materialized-view') return 'materialized-view'
      if (data.type === 'column') return 'column'
      if (data.type === 'index') return 'index'
      if (data.type === 'foreign-key') return 'foreign-key'
      if (data.type === 'unique-constraint') return 'unique-constraint'
      if (data.type === 'check-constraint') return 'check-constraint'
      if (data.type === 'exclude-constraint') return 'exclude-constraint'
      if (data.type === 'trigger') return 'trigger'
      if (data.type === 'rule') return 'rule'
      if (data.type === 'function') return 'function'
      if (data.type === 'procedure') return 'procedure'
      if (data.type === 'aggregate') return 'aggregate'
      if (data.type === 'sequence') return 'sequence'
      if (data.type === 'enum-type') return 'enum-type'
      if (data.type === 'enum-label') return 'enum-label'
      if (data.type === 'domain-type') return 'domain-type'
      if (data.type === 'domain-detail') return 'domain-detail'
      if (data.type === 'domain-constraint') return 'domain-constraint'
      if (data.type === 'composite-type') return 'composite-type'
      if (data.type === 'composite-field') return 'composite-field'
      if (data.type === 'partition-key') return 'partition-key'
      if (data.type === 'extension') return 'extension'
      return undefined
    })()

    options.onInspectObject?.({
      connectionId: data.connectionId,
      database: String(metadata.database || metadata.name || ''),
      schema: typeof metadata.schema === 'string' ? metadata.schema : undefined,
      objectName: String(metadata.name || data.title || ''),
      objectType,
      metadata,
    })
  }

  function handleTableSelected(data: TableEventData) {
    const connectionId = data.connectionId || options.connectionStore.activeConnectionId
    const key = `table-${connectionId}-${data.database}-${data.table}`
    options.onInspectObject?.({
      connectionId: connectionId || undefined,
      database: data.database,
      schema: data.schema || data.metadata?.schema,
      objectName: data.table,
      objectType: 'table',
      tabKey: key,
      tabType: TabType.Data,
      readOnly: false,
      metadata: data.metadata,
    })
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
    options.onInspectObject?.({
      connectionId: data.connectionId,
      database: data.name,
      objectName: data.name,
      objectType: 'database',
      metadata: data as Record<string, unknown>,
    })

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
    await options.openOrCreateQueryTab(data)
  }

  function handleOpenSavedScript(data: QueryEventData) {
    void handleNewQuery(data)
  }

  function handleGeneratedSql(data: { sql: string; database: string; connectionId: string; title?: string; autoExecuteNonce?: string }) {
    void handleNewQuery({
      connectionId: data.connectionId,
      database: data.database,
      content: data.sql,
      title: data.title,
      autoExecuteNonce: data.autoExecuteNonce,
    })
  }

  function handleViewStructure(data: TableEventData) {
    const key = `structure-${data.connectionId}-${data.database}-${data.table}`
    options.onInspectObject?.({
      connectionId: data.connectionId,
      database: data.database,
      schema: data.schema,
      objectName: data.table,
      objectType: 'table',
      tabKey: key,
      tabType: TabType.Design,
      readOnly: true,
      metadata: data.metadata,
    })
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
      designTab: data.designTab,
    })
  }

  function handleDesignTable(data: TableEventData) {
    const key = `design-${data.connectionId}-${data.database}-${data.table}`
    options.onInspectObject?.({
      connectionId: data.connectionId,
      database: data.database,
      schema: data.schema,
      objectName: data.table,
      objectType: 'table',
      tabKey: key,
      tabType: TabType.Design,
      readOnly: false,
      metadata: data.metadata,
    })
    if (options.tabExists(key)) {
      const tab = options.dataTabs.value.find(item => item.key === key)
      if (tab) {
        tab.designTab = data.designTab
        tab.designAction = data.designAction
      }
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
      designTab: data.designTab,
      designAction: data.designAction,
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
    handleObjectSelected,
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
