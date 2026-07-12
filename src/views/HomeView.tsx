import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Empty, Menu, Tabs } from 'antd'
import type { MenuProps } from 'antd'
import {
  ApartmentOutlined, BuildOutlined, EditOutlined, FileTextOutlined,
  RetweetOutlined, SettingOutlined, TableOutlined,
} from '@ant-design/icons'
import { message } from '../ui/antd'
import AppHeader from '../components/layout/AppHeader'
import AppStatusBar from '../components/layout/AppStatusBar'
import ConnectionPanel from '../components/connection/ConnectionPanel'
import ConnectionDialog from '../components/connection/ConnectionDialog'
import { GenericTabPlaceholder } from '../components/workspace/TabContentPlaceholder'
import { useAppStore, useAppTheme } from '../stores/appStore'
import { useConnectionStore } from '../stores/connectionStore'
import { useRightPanelStore } from '../stores/rightPanelStore'
import { useSidebarResize } from '../hooks/useSidebarResize'
import { useConnectionHealthMonitor } from '../hooks/useConnectionHealthMonitor'
import { useTabManager, type DataTab, type SqlEditorHandle } from '../hooks/useTabManager'
import type { RedisEditorHandle } from '../components/editor/RedisEditor'
import { useWorkspaceTabContextMenu } from '../hooks/useWorkspaceTabContextMenu'
import { useWorkspaceSessionLifecycle } from '../hooks/useWorkspaceSessionLifecycle'
import { useWorkspaceCloseGuards } from '../hooks/useWorkspaceCloseGuards'
import { useWorkspaceClipboardRouting } from '../hooks/useWorkspaceClipboardRouting'
import { getDatabaseSupportProfile, supportsSqlWorkspace, supportsQueryBuilder, supportsDataCompare } from '@/utils/databaseSupport'
import { logStartupStage } from '@/utils/startupProfiler'
import { TabType } from '@/types/workspace'
import type { RightPanelObjectType } from '@/types/rightPanel'
import type { ConnectionConfig, ConnectionStatus } from '@/types/database'
import styles from './HomeView.module.css'

const SqlEditor = lazy(() => import('../components/editor/SqlEditor'))
const RightPanelHost = lazy(() => import('../components/right-panel/RightPanelHost'))
const TableDataGrid = lazy(() => import('../components/data/TableDataGrid'))
const TableDesigner = lazy(() => import('../components/database/TableDesigner'))
const RedisEditor = lazy(() => import('../components/editor/RedisEditor'))
const SettingsContent = lazy(() => import('../components/settings/SettingsContent'))
const GlobalSearch = lazy(() => import('../components/search/GlobalSearch'))
const QueryBuilder = lazy(() => import('../components/tools/QueryBuilder'))
const DataCompare = lazy(() => import('../components/tools/DataCompare'))
const ErDiagram = lazy(() => import('../components/tools/ErDiagram'))

/**
 * 工作台组合根：布局 + 连接面板/对话框 + 工作区 tabs + 会话持久化/恢复 +
 * 全部 8 类 tab 内容 + 关闭保护（脏 tab 三按钮确认/窗口关闭拦截）+ 剪贴板路由。
 */

/** 查询 tab 打开参数（对等 useSqlDocumentActions 的 SqlDocumentInput，该 hook 随 Slice 10 整体迁入） */
interface SqlDocumentInput {
  connectionId?: string
  database?: string
  filePath?: string
  title?: string
  content?: string
  autoExecuteNonce?: string
}

/** 取 search_path 的首个有效 schema（照抄 Vue 版 HomeView 同名函数） */
function getPrimarySearchPathSchema(searchPath: string): string {
  return searchPath
    .split(',')
    .map((item) => item.trim())
    .find((item) => item.length > 0 && item !== '"$user"' && item !== '$user')
    || ''
}

const TAB_TYPE_ICONS: Partial<Record<string, ReactNode>> = {
  query: <FileTextOutlined />,
  data: <TableOutlined />,
  design: <EditOutlined />,
  builder: <BuildOutlined />,
  compare: <RetweetOutlined />,
  'er-diagram': <ApartmentOutlined />,
  settings: <SettingOutlined />,
}

export default function HomeView() {
  const { t } = useTranslation()
  const theme = useAppTheme()
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const { sidebarWidth, startResize } = useSidebarResize()

  const connections = useConnectionStore((s) => s.connections)
  const connectionStatuses = useConnectionStore((s) => s.connectionStatuses)
  const searchPaths = useConnectionStore((s) => s.searchPaths)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  const healthMonitor = useConnectionHealthMonitor()

  const {
    dataTabs, mainTabKey, setMainTabKey,
    activeTab, activeQueryTab, activeTabType, activeTabDatabase,
    addTab, replaceAllTabs, closeTab,
    handleContentChange, updateTab, tabExists,
    setSqlEditorRef, getActiveEditor, updateSqlExecutionState, findTabByKey, handleFileSaved, removeTabs,
    activeEditorExecutionState,
  } = useTabManager()

  // SqlEditor 的 ref 回调按 tab key 缓存保持稳定，
  // 避免每次渲染 ref 抖动（null→handle）引发执行状态表反复增删
  const editorRefCallbacksRef = useRef(new Map<string, (handle: SqlEditorHandle | null) => void>())
  const redisEditorRef = useRef<RedisEditorHandle>(null)
  const getEditorRefCallback = (key: string) => {
    let cb = editorRefCallbacksRef.current.get(key)
    if (!cb) {
      cb = (handle) => setSqlEditorRef(key, handle)
      editorRefCallbacksRef.current.set(key, cb)
    }
    return cb
  }

  const {
    contextMenuVisible, contextMenuX, contextMenuY,
    currentContextTab, handleTabContextMenu, hideContextMenu,
    hasClosableTabsOnLeft, hasClosableTabsOnRight, hasClosableOtherTabs, hasClosableSavedTabs,
    currentContextTabFilePath,
  } = useWorkspaceTabContextMenu(dataTabs)

  // 连接对话框状态
  const [showConnectionDialog, setShowConnectionDialog] = useState(false)
  const [editingConnection, setEditingConnection] = useState<ConnectionConfig | null>(null)
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)

  // 右侧面板
  const rightPanelCollapsed = useRightPanelStore((s) => s.collapsed)
  const toggleRightPanel = useRightPanelStore((s) => s.toggleCollapsed)
  const setRightPanelContext = useRightPanelStore((s) => s.setContext)

  const openConnectionDialog = () => {
    setEditingConnection(null)
    setShowConnectionDialog(true)
  }

  // 激活 tab → 右侧面板 context（对等 Vue watch([activeTab, connections], {deep, immediate})）
  const activeTabKey = activeTab?.key
  useEffect(() => {
    if (!activeTab) return
    const connection = activeTab.connectionId
      ? connections.find((item) => item.id === activeTab.connectionId)
      : null
    setRightPanelContext({
      connectionId: activeTab.connectionId,
      connectionName: connection?.name,
      database: activeTab.database,
      schema: activeTab.schema,
      objectName: activeTab.table || activeTab.title,
      objectType: activeTab.table ? 'table' : 'unknown',
      tabKey: activeTab.key,
      tabType: activeTab.type,
      readOnly: activeTab.readOnly,
      metadata: activeTab as unknown as Record<string, unknown>,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabKey, activeTab?.database, activeTab?.schema, activeTab?.table, activeTab?.title, connections, setRightPanelContext])

  useEffect(() => {
    if (connections.length > 0) healthMonitor.start()
  }, [connections.length, healthMonitor])

  const activeConnection = activeConnectionId
    ? connections.find((c) => c.id === activeConnectionId) ?? null
    : null
  const activeSupportProfile = getDatabaseSupportProfile(activeConnection?.db_type || null)
  const isSqlSupported = !activeConnection || supportsSqlWorkspace(activeConnection.db_type)

  // 状态栏连接：优先激活 tab 绑定的连接（照抄 Vue 版 statusBarConnection）
  const statusBarConnection = activeTab?.connectionId
    ? connections.find((c) => c.id === activeTab.connectionId) || null
    : activeConnection

  const statusBarConnectionStatus: ConnectionStatus = statusBarConnection
    ? connectionStatuses.get(statusBarConnection.id) || 'disconnected'
    : 'disconnected'

  const statusBarSchemaName = (() => {
    if (activeTab?.schema) return activeTab.schema
    if (statusBarConnection) {
      const schema = getPrimarySearchPathSchema(searchPaths.get(statusBarConnection.id) || '')
      if (schema) return schema
    }
    return t('status_bar.default_schema')
  })()

  // ===== 查询 tab 创建（标题/库解析照抄 useSqlDocumentActions）=====

  const generateNextUntitledTitle = () => {
    const used = new Set(
      dataTabs
        .map((tab) => /^未命名-(\d+)\.sql$/i.exec(tab.title)?.[1] || /^untitled-(\d+)\.sql$/i.exec(tab.title)?.[1])
        .filter((value): value is string => Boolean(value))
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    )

    let index = 1
    while (used.has(index)) index += 1
    return `untitled-${index}.sql`
  }

  const resolveQueryTitle = (data: SqlDocumentInput) => {
    if (data.title) return data.title
    if (data.filePath) return data.filePath.split(/[\\/]/).pop() || data.filePath
    return generateNextUntitledTitle()
  }

  const resolveQueryDatabase = (connectionId?: string, database?: string) => {
    if (database) return database
    if (!connectionId) return database

    const connection = connections.find((item) => item.id === connectionId)
    if (connection?.db_type === 'sqlite') {
      return 'main'
    }

    return database
  }

  const openOrCreateQueryTab = async (data: SqlDocumentInput): Promise<boolean> => {
    if (!isSqlSupported) return false

    const connectionId = data.connectionId || activeConnectionId || undefined
    const database = resolveQueryDatabase(connectionId, data.database)

    if (data.filePath) {
      const existingTab = dataTabs.find((tab) => tab.type === TabType.Query && tab.filePath === data.filePath)
      if (existingTab) {
        setMainTabKey(existingTab.key)
        return true
      }
    }

    const key = `query-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const isOpeningFile = Boolean(data.filePath)
    addTab({
      key,
      title: resolveQueryTitle(data),
      type: TabType.Query,
      connectionId: connectionId || undefined,
      database,
      content: data.content || '',
      filePath: data.filePath,
      dirty: false,
      isUntitled: !isOpeningFile,
      autoExecuteNonce: data.autoExecuteNonce,
    })

    return true
  }

  const handleNewQuery = () => {
    void openOrCreateQueryTab({})
  }

  // ===== SQL 文档保存/打开（照抄 useSqlDocumentActions 子集）=====

  function getDocumentContent(tab: DataTab) {
    return tab.content || ''
  }

  function buildSuggestedFileName(tab: DataTab) {
    const candidate = tab.filePath?.split(/[\\/]/).pop() || tab.title || 'query.sql'
    return candidate.toLowerCase().endsWith('.sql') ? candidate : `${candidate}.sql`
  }

  async function saveQueryTabAs(tabKey: string): Promise<boolean> {
    const tab = findTabByKey(tabKey)
    if (!tab || tab.type !== TabType.Query) return false
    const content = getDocumentContent(tab)
    if (!content.trim()) return false

    const { save } = await import('@tauri-apps/plugin-dialog')
    const { utilsApi, SQL_FILE_FILTERS } = await import('@/api')
    const filePath = await save({
      defaultPath: tab.filePath || buildSuggestedFileName(tab),
      filters: [...SQL_FILE_FILTERS],
    })
    if (!filePath) return false
    const saved = await utilsApi.saveFileAs({ path: filePath, content })
    handleFileSaved(tabKey, saved.path, saved.title)
    return true
  }

  async function saveQueryTab(tabKey: string): Promise<boolean> {
    const tab = findTabByKey(tabKey)
    if (!tab || tab.type !== TabType.Query) return false
    const content = getDocumentContent(tab)
    if (!content.trim()) return false
    if (!tab.filePath) return saveQueryTabAs(tabKey)

    const { utilsApi } = await import('@/api')
    await utilsApi.writeFile(tab.filePath, content)
    handleFileSaved(tabKey, tab.filePath, tab.filePath.split(/[\\/]/).pop() || tab.title)
    return true
  }

  const handleSaveActiveQuery = () => {
    if (!activeQueryTab) return
    void saveQueryTab(mainTabKey)
  }
  const handleSaveActiveQueryAs = () => {
    if (!activeQueryTab) return
    void saveQueryTabAs(mainTabKey)
  }

  async function handleOpenSqlFile() {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { utilsApi, SQL_FILE_FILTERS } = await import('@/api')
    const selected = await open({ filters: [...SQL_FILE_FILTERS], multiple: false })
    if (!selected || Array.isArray(selected)) return
    try {
      const content = await utilsApi.readFile(selected)
      const opened = await openOrCreateQueryTab({
        filePath: selected,
        content,
        title: selected.split(/[\\/]/).pop() || selected,
      })
      if (opened) window.setTimeout(() => getActiveEditor()?.focusEditor(), 0)
    } catch (e: unknown) {
      const { getErrorMessage } = await import('@/utils/errorHandler')
      message.error(`${t('common.fail')}: ${getErrorMessage(e)}`)
    }
  }

  // ===== 数据库树事件（照抄 useWorkspaceTabActions 子集；其余动作随 Slice 15+ 迁入）=====

  const KNOWN_OBJECT_TYPES = new Set<RightPanelObjectType>([
    'database', 'schema', 'table', 'view', 'materialized-view', 'column', 'index', 'foreign-key',
    'unique-constraint', 'check-constraint', 'exclude-constraint', 'trigger', 'rule', 'function',
    'procedure', 'aggregate', 'sequence', 'enum-type', 'enum-label', 'domain-type', 'domain-detail',
    'domain-constraint', 'composite-type', 'composite-field', 'partition-key', 'extension',
  ])

  const inspectObject = (payload: {
    connectionId?: string
    database?: string
    schema?: string
    objectName?: string
    objectType?: RightPanelObjectType
    tabKey?: string
    tabType?: string
    readOnly?: boolean
    metadata?: Record<string, unknown>
  }) => {
    const connection = payload.connectionId
      ? connections.find((item) => item.id === payload.connectionId)
      : null
    setRightPanelContext({
      connectionId: payload.connectionId,
      connectionName: connection?.name,
      database: payload.database,
      schema: payload.schema,
      objectName: payload.objectName,
      objectType: payload.objectType,
      tabKey: payload.tabKey,
      tabType: payload.tabType,
      readOnly: payload.readOnly,
      metadata: payload.metadata,
    })
  }

  const handleObjectSelected = (data: { connectionId: string; type: string; title: string; metadata: Record<string, unknown> }) => {
    const metadata = data.metadata || {}
    const objectType = KNOWN_OBJECT_TYPES.has(data.type as RightPanelObjectType)
      ? (data.type as RightPanelObjectType)
      : undefined
    inspectObject({
      connectionId: data.connectionId,
      database: String(metadata.database || metadata.name || ''),
      schema: typeof metadata.schema === 'string' ? metadata.schema : undefined,
      objectName: String(metadata.name || data.title || ''),
      objectType,
      metadata,
    })
  }

  const handleTableSelected = (data: { connectionId?: string; database: string; table: string; schema?: string; metadata?: any }) => {
    const connectionId = data.connectionId || activeConnectionId
    const key = `table-${connectionId}-${data.database}-${data.table}`
    inspectObject({
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
    if (tabExists(key)) {
      setMainTabKey(key)
      return
    }
    addTab({
      key,
      title: data.table || '',
      type: TabType.Data,
      connectionId: connectionId!,
      database: data.database,
      table: data.table,
      schema: data.schema || data.metadata?.schema,
    })
  }

  const handleDatabaseSelected = (data: { connectionId: string; name?: string } & Record<string, unknown>) => {
    inspectObject({
      connectionId: data.connectionId,
      database: data.name,
      objectName: data.name,
      objectType: 'database',
      metadata: data as Record<string, unknown>,
    })
    if (data.connectionId) {
      useConnectionStore.getState().setActiveConnection(data.connectionId)
    }
    // Redis：打开命令行 tab 并切库（照抄 useWorkspaceTabActions）
    if (!isSqlSupported) {
      if (useConnectionStore.getState().getActiveConnection()?.db_type === 'redis') {
        if (!tabExists('redis')) {
          addTab({ key: 'redis', title: 'Redis 命令行', type: TabType.Redis, closable: false })
        }
        setMainTabKey('redis')
        window.setTimeout(() => {
          void redisEditorRef.current?.switchDatabase(data.name || '')
        }, 100)
      }
    }
  }

  const handleDesignTable = (data: {
    connectionId: string
    database: string
    table: string
    schema?: string
    designTab?: 'columns' | 'indexes' | 'foreign_keys' | 'ddl'
    designAction?: 'add_column' | 'add_index' | 'add_foreign_key'
  }) => {
    const key = `design-${data.connectionId}-${data.database}-${data.table}`
    inspectObject({
      connectionId: data.connectionId,
      database: data.database,
      schema: data.schema,
      objectName: data.table,
      objectType: 'table',
      tabKey: key,
      tabType: TabType.Design,
      readOnly: false,
    })
    if (tabExists(key)) {
      updateTab(key, { designTab: data.designTab, designAction: data.designAction })
      setMainTabKey(key)
      return
    }
    addTab({
      key,
      title: `${t('tree.design_table')}: ${data.table}`,
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

  // 打开设置 tab（照抄 useWorkspaceViewActions.openSettings）
  const openSettings = () => {
    const key = 'settings'
    if (tabExists(key)) {
      setMainTabKey(key)
      return
    }
    addTab({ key, title: t('common.settings'), type: TabType.Settings })
  }

  // ===== 工具页入口（照抄 useWorkspaceTabActions / useWorkspaceViewActions）=====

  const handleOpenQueryBuilder = () => {
    const conn = useConnectionStore.getState().getActiveConnection()
    if (!conn?.id) {
      message.warning(t('tools.query_builder.require_connection'))
      return
    }
    if (!supportsQueryBuilder(conn.db_type)) {
      message.warning(t('tools.query_builder.unsupported_connection'))
      return
    }
    const key = `builder-${conn.id}`
    if (tabExists(key)) {
      setMainTabKey(key)
      return
    }
    addTab({
      key,
      title: t('tools.query_builder.title'),
      type: TabType.Builder,
      connectionId: conn.id,
      database: activeTabType === TabType.Query ? activeTabDatabase : conn.database,
    })
  }

  const handleOpenDataCompare = () => {
    const conn = useConnectionStore.getState().getActiveConnection()
    if (!conn?.id) {
      message.warning(t('tools.data_compare.require_connection'))
      return
    }
    if (!supportsDataCompare(conn.db_type)) {
      message.warning(t('tools.data_compare.unsupported_connection'))
      return
    }
    const key = `compare-${conn.id}`
    if (tabExists(key)) {
      setMainTabKey(key)
      return
    }
    addTab({
      key,
      title: t('tools.data_compare.title'),
      type: TabType.Compare,
      connectionId: conn.id,
      database: activeTabType === TabType.Query ? activeTabDatabase : conn.database,
    })
  }

  const openErDiagram = (connectionId?: string, database?: string, table?: string, schema?: string) => {
    if (!connectionId || !table) return
    const key = `er-${connectionId}-${database || ''}-${schema || ''}-${table}`
    if (tabExists(key)) {
      setMainTabKey(key)
      return
    }
    addTab({
      key,
      title: t('tools.er_diagram.title'),
      type: TabType.ErDiagram,
      connectionId,
      database,
      table,
      schema,
    })
  }

  // ===== 关闭保护 + 剪贴板路由（Slice 26）=====

  const { closeTabWithConfirm, closeTabsWithConfirm } = useWorkspaceCloseGuards({
    dataTabs,
    setMainTabKey,
    findTabByKey,
    saveQueryTab,
    closeTab,
    removeTabs,
    t,
  })

  useWorkspaceClipboardRouting({
    getActiveTabType: () => activeTabType as TabType | undefined,
    getActiveEditor,
  })

  // ===== 会话持久化与恢复（Slice 9）=====
  const sessionLifecycle = useWorkspaceSessionLifecycle({
    dataTabs,
    mainTabKey,
    isSqlSupported,
    applyRestoredSession: replaceAllTabs,
    openOrCreateQueryTab,
  })

  // 对等 Vue 版 watch(dataTabs, {deep:true}) + watch(mainTabKey)：
  // tabs 全走不可变更新，引用变化即触发；跳过首帧（Vue watch 非 immediate）
  const skipFirstSessionSaveRef = useRef(true)
  const { scheduleSessionSave } = sessionLifecycle
  useEffect(() => {
    if (skipFirstSessionSaveRef.current) {
      skipFirstSessionSaveRef.current = false
      return
    }
    scheduleSessionSave()
  }, [dataTabs, mainTabKey, scheduleSessionSave])

  // 对等 Vue 版 onMounted → restoreSession() / onUnmounted → cleanup()；
  // ref 防 StrictMode 开发期双执行（避免空会话时创建两个默认查询 tab）。
  // restoreSession/cleanup 均为稳定 useCallback，仅需挂载时执行一次
  const restoreStartedRef = useRef(false)
  useEffect(() => {
    if (!restoreStartedRef.current) {
      restoreStartedRef.current = true
      void logStartupStage('HomeView mounted')
      void sessionLifecycle.restoreSession()
    }
    return sessionLifecycle.cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 对等 Vue 版 useWorkspacePageLifecycle 的 watch(mainTabKey)：切到查询 tab 后聚焦编辑器
  useEffect(() => {
    if (activeTabType !== TabType.Query) return
    const timer = window.setTimeout(() => getActiveEditor()?.focusEditor(), 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTabKey])

  const getConnectionColor = (connectionId?: string) =>
    connectionId ? connections.find((c) => c.id === connectionId)?.color || '' : ''

  const renderTabLabel = (tab: DataTab) => {
    const color = getConnectionColor(tab.connectionId)
    const isError = Boolean(tab.connectionId) && connectionStatuses.get(tab.connectionId!) === 'error'
    return (
      <span
        className={styles.tabTitle}
        onContextMenu={(e) => {
          e.preventDefault()
          handleTabContextMenu(e, tab.key, tab.closable !== false)
        }}
      >
        {color && (
          <span
            className={`${styles.tabConnectionDot} ${isError ? styles.tabConnectionDotError : ''}`}
            style={{ backgroundColor: color }}
          />
        )}
        {TAB_TYPE_ICONS[tab.type]}
        <span className={styles.titleText}>
          {tab.title}
          {tab.type === 'query' && tab.dirty && <span className={styles.tabDirtyIndicator}> •</span>}
        </span>
      </span>
    )
  }

  const renderTabContent = (tab: DataTab) => {
    if (tab.type === 'query') {
      return (
        <Suspense fallback={null}>
          <SqlEditor
            ref={getEditorRefCallback(tab.key)}
            connectionId={tab.connectionId}
            initialDatabase={tab.database}
            initialValue={tab.content}
            filePath={tab.filePath}
            tabId={tab.key}
            autoExecuteNonce={tab.autoExecuteNonce}
            active={tab.key === mainTabKey}
            onContentChange={(val) => handleContentChange(tab.key, val)}
            onRequestSave={() => void saveQueryTab(tab.key)}
            onRequestSaveAs={() => void saveQueryTabAs(tab.key)}
            onDatabaseChange={(db) => updateTab(tab.key, { database: String(db || '') })}
            onExecutionStateChange={(state) => updateSqlExecutionState(tab.key, state)}
          />
        </Suspense>
      )
    }
    if (tab.type === 'data') {
      return (
        <Suspense fallback={null}>
          <TableDataGrid
            connectionId={tab.connectionId!}
            database={tab.database!}
            table={tab.table!}
            schema={tab.schema}
          />
        </Suspense>
      )
    }
    if (tab.type === 'design') {
      return (
        <Suspense fallback={null}>
          <TableDesigner
            connectionId={tab.connectionId!}
            database={tab.database!}
            table={tab.table!}
            schema={tab.schema}
            readOnly={tab.readOnly}
            initialTab={tab.designTab}
            initialAction={tab.designAction}
          />
        </Suspense>
      )
    }
    if (tab.type === 'redis') {
      return (
        <Suspense fallback={null}>
          <RedisEditor ref={redisEditorRef} />
        </Suspense>
      )
    }
    if (tab.type === 'settings') {
      return (
        <Suspense fallback={null}>
          <SettingsContent embedded />
        </Suspense>
      )
    }
    if (tab.type === 'builder') {
      return (
        <Suspense fallback={null}>
          <QueryBuilder
            connectionId={tab.connectionId || null}
            initialDatabase={tab.database || null}
            onExecuteQuery={(payload) => void openOrCreateQueryTab({
              connectionId: tab.connectionId,
              database: payload.database || tab.database,
              content: payload.sql,
            })}
          />
        </Suspense>
      )
    }
    if (tab.type === 'compare') {
      return (
        <Suspense fallback={null}>
          <DataCompare connectionId={tab.connectionId || null} initialDatabase={tab.database || null} />
        </Suspense>
      )
    }
    if (tab.type === 'er-diagram') {
      return (
        <Suspense fallback={null}>
          <ErDiagram
            connectionId={tab.connectionId || null}
            database={tab.database || null}
            table={tab.table || null}
            schema={tab.schema || null}
          />
        </Suspense>
      )
    }
    return <GenericTabPlaceholder label={`「${tab.type}」类型内容将在后续切片迁移`} />
  }

  const tabItems = dataTabs.map((tab) => ({
    key: tab.key,
    closable: tab.closable !== false,
    label: renderTabLabel(tab),
    children: <div className={styles.tabContentWrapper}>{renderTabContent(tab)}</div>,
  }))

  const tabMenuItems: MenuProps['items'] = [
    { key: 'close-current', disabled: !currentContextTab.closable, label: t('common.close') },
    { key: 'close-left', disabled: !hasClosableTabsOnLeft, label: t('common.close_left') },
    { key: 'close-right', disabled: !hasClosableTabsOnRight, label: t('common.close_right') },
    { key: 'close-others', disabled: !hasClosableOtherTabs, label: t('common.close_others') },
    { key: 'close-saved', disabled: !hasClosableSavedTabs, label: t('common.close_saved') },
    { type: 'divider' },
    { key: 'open-file-location', disabled: !currentContextTabFilePath, label: t('editor.open_file_location') },
  ]

  // 关闭动作全部走关闭保护（对等 Vue useWorkspaceTabMenuActions）
  const handleTabMenuClick: MenuProps['onClick'] = ({ key }) => {
    const anchor = currentContextTab.key
    if (!anchor) return
    hideContextMenu()
    if (key === 'close-current' && currentContextTab.closable) {
      void closeTabWithConfirm(anchor)
    } else if (key === 'close-left') {
      const anchorIndex = dataTabs.findIndex((tab) => tab.key === anchor)
      const keys = dataTabs.slice(0, anchorIndex).filter((tab) => tab.closable !== false).map((tab) => tab.key)
      void closeTabsWithConfirm(keys, anchor)
    } else if (key === 'close-right') {
      const anchorIndex = dataTabs.findIndex((tab) => tab.key === anchor)
      const keys = dataTabs.slice(anchorIndex + 1).filter((tab) => tab.closable !== false).map((tab) => tab.key)
      void closeTabsWithConfirm(keys, anchor)
    } else if (key === 'close-others') {
      const keys = dataTabs.filter((tab) => tab.key !== anchor && tab.closable !== false).map((tab) => tab.key)
      void closeTabsWithConfirm(keys, anchor)
    } else if (key === 'close-saved') {
      const keys = dataTabs.filter((tab) => tab.closable !== false && Boolean(tab.filePath)).map((tab) => tab.key)
      void closeTabsWithConfirm(keys, anchor)
    } else if (key === 'open-file-location') {
      const filePath = currentContextTabFilePath
      if (filePath) {
        void import('@/api/fileManager').then(({ openInFileManager }) => openInFileManager(filePath).catch(() => {}))
      }
    }
  }

  return (
    <div className={`${styles.mainLayout} ${theme === 'dark' ? 'dark-mode' : ''}`}>
      <AppHeader
        canSaveQuery={Boolean(activeQueryTab)}
        canSaveQueryAs={Boolean(activeQueryTab)}
        showQueryBuilder={Boolean(activeConnection?.id) && activeSupportProfile.supportsQueryBuilder}
        showDataCompare={Boolean(activeConnection?.id) && activeSupportProfile.supportsDataCompare}
        onNewConnection={openConnectionDialog}
        onNewQuery={handleNewQuery}
        onOpenSqlFile={() => void handleOpenSqlFile()}
        onSaveQuery={handleSaveActiveQuery}
        onSaveQueryAs={handleSaveActiveQueryAs}
        onOpenQueryBuilder={handleOpenQueryBuilder}
        onOpenDataCompare={handleOpenDataCompare}
        onOpenSettings={openSettings}
        onOpenSearch={() => setShowGlobalSearch(true)}
      />

      <div className={styles.contentContainer}>
        <div
          className={styles.sidebarWrapper}
          style={{ width: sidebarCollapsed ? 0 : `${sidebarWidth}px` }}
        >
          <div className={styles.sidebarInner}>
            <ConnectionPanel
              onAddConnection={openConnectionDialog}
              onEditConnection={(connection) => {
                setEditingConnection(connection)
                setShowConnectionDialog(true)
              }}
              onTableSelected={handleTableSelected}
              onDatabaseSelected={handleDatabaseSelected}
              onObjectSelected={handleObjectSelected}
              onNewQuery={(data) => void openOrCreateQueryTab({ connectionId: data.connectionId || undefined, database: data.database })}
              onGenerateSql={(data) => void openOrCreateQueryTab({
                connectionId: data.connectionId || undefined,
                database: data.database,
                content: data.sql,
                title: data.title,
                autoExecuteNonce: data.autoExecuteNonce,
              })}
              onDesignTable={handleDesignTable}
              onOpenErDiagram={(data) => openErDiagram(data.connectionId, data.database, data.table, data.schema)}
            />
          </div>
        </div>

        {!sidebarCollapsed && (
          <div className={styles.sidebarResizer} onPointerDown={startResize} />
        )}

        <div className={styles.mainWorkspace}>
          {dataTabs.length > 0 ? (
            <Tabs
              type="editable-card"
              size="small"
              className={styles.workspaceTabs}
              activeKey={mainTabKey}
              onChange={setMainTabKey}
              onEdit={(e, action) => {
                if (action === 'add') handleNewQuery()
                else void closeTabWithConfirm(String(e))
              }}
              items={tabItems}
            />
          ) : (
            <div className={styles.emptyWorkspace}>
              <Empty description={t('editor.no_open_tabs')}>
                <Button type="primary" onClick={handleNewQuery}>
                  {t('tree.new_query')}
                </Button>
              </Empty>
            </div>
          )}
        </div>

        <Suspense fallback={null}>
          <RightPanelHost />
        </Suspense>
      </div>

      {contextMenuVisible && (
        <div className="app-context-menu-overlay" onClick={() => hideContextMenu()}>
          <div
            className="app-context-menu"
            style={{ left: contextMenuX, top: contextMenuY }}
            onClick={(e) => e.stopPropagation()}
          >
            <Menu onClick={handleTabMenuClick} items={tabMenuItems} selectable={false} mode="inline" />
          </div>
        </div>
      )}

      <ConnectionDialog
        open={showConnectionDialog}
        editingConnection={editingConnection}
        onClose={() => {
          setShowConnectionDialog(false)
          setEditingConnection(null)
        }}
      />

      <Suspense fallback={null}>
        <GlobalSearch
          open={showGlobalSearch}
          connectionId={activeConnectionId}
          onClose={() => setShowGlobalSearch(false)}
          onViewData={(data) => handleTableSelected({ database: data.database || '', table: data.table })}
        />
      </Suspense>

      <AppStatusBar
        connectionName={statusBarConnection?.name || t('status_bar.no_connection')}
        databaseName={activeTab?.database || statusBarConnection?.database || t('status_bar.not_available')}
        schemaName={statusBarSchemaName}
        readOnly={Boolean(statusBarConnection?.read_only)}
        connectionStatus={statusBarConnectionStatus}
        executionState={activeEditorExecutionState}
        rightPanelCollapsed={rightPanelCollapsed}
        onToggleRightPanel={toggleRightPanel}
      />
    </div>
  )
}
