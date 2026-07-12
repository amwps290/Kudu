import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Checkbox, Input, Menu } from 'antd'
import type { MenuProps } from 'antd'
import { Icon } from '@iconify/react'
import {
  DatabaseOutlined, PlusOutlined, LinkOutlined, EditOutlined, DeleteOutlined,
  DisconnectOutlined, DownOutlined, RightOutlined, SearchOutlined,
  ReloadOutlined, LoadingOutlined,
} from '@ant-design/icons'
import { message, Modal, Empty } from '../../ui/antd'
import { getErrorMessage } from '@/utils/errorHandler'
import { createStartupTimer, logStartupStage } from '@/utils/startupProfiler'
import { useConnectionStore } from '../../stores/connectionStore'
import { useContextMenu } from '../../hooks/useContextMenu'
import DatabaseTree from '../database/DatabaseTree'
import CreateDatabaseDialog from '../database/CreateDatabaseDialog'
import type { ConnectionConfig, ConnectionStatus } from '@/types/database'
import styles from './ConnectionPanel.module.css'

export interface ConnectionPanelProps {
  onAddConnection?: () => void
  onEditConnection?: (connection: ConnectionConfig) => void
  onTableSelected?: (data: { connectionId: string; database: string; table: string; schema?: string; metadata?: any }) => void
  onDatabaseSelected?: (data: { connectionId: string; name?: string } & Record<string, unknown>) => void
  onObjectSelected?: (data: { connectionId: string; type: string; title: string; metadata: Record<string, unknown> }) => void
  onNewQuery?: (data: { database?: string; connectionId?: string | null }) => void
  onGenerateSql?: (data: { sql: string; database?: string; connectionId?: string | null; title?: string; autoExecuteNonce?: string }) => void
  onDesignTable?: (data: {
    connectionId: string
    database: string
    table: string
    schema?: string
    designTab?: 'columns' | 'indexes' | 'foreign_keys' | 'ddl'
    designAction?: 'add_column' | 'add_index' | 'add_foreign_key'
  }) => void
  onOpenErDiagram?: (data: { connectionId: string; database?: string; table: string; schema?: string }) => void
}

/** 数据库品牌图标（照抄 Vue 版 getBrandIcon） */
function getBrandIcon(dbType?: string) {
  const type = (dbType || '').toLowerCase()
  if (type.includes('postgres')) return 'logos:postgresql'
  if (type.includes('mysql')) return 'logos:mysql'
  if (type.includes('redis')) return 'logos:redis'
  if (type.includes('sqlite')) return 'logos:sqlite'
  if (type.includes('mongo')) return 'logos:mongodb-icon'
  return 'material-symbols:database'
}

function getStatusBadge(status: ConnectionStatus): 'success' | 'processing' | 'error' | 'default' {
  return status === 'connected' ? 'success' : status === 'connecting' ? 'processing' : status === 'error' ? 'error' : 'default'
}

export default function ConnectionPanel({ onAddConnection, onEditConnection, onTableSelected, onDatabaseSelected, onObjectSelected, onNewQuery, onGenerateSql, onDesignTable, onOpenErDiagram }: ConnectionPanelProps) {
  const { t } = useTranslation()
  const connections = useConnectionStore((s) => s.connections)
  const connectionStatuses = useConnectionStore((s) => s.connectionStatuses)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)

  const [searchText, setSearchText] = useState('')
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false)
  const [searchRegex, setSearchRegex] = useState(false)
  const [searchColumns, setSearchColumns] = useState(false)
  // 匹配计数由 DatabaseTree 上报（对等 Vue handleUpdateMatchesCount，多树时后报者覆盖）
  const [matchesCount, setMatchesCount] = useState(0)
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set())
  const [selectedConnection, setSelectedConnection] = useState<ConnectionConfig | null>(null)
  const [createDatabaseTarget, setCreateDatabaseTarget] = useState<ConnectionConfig | null>(null)
  const { contextMenuVisible, contextMenuX, contextMenuY, showContextMenu, hideContextMenu } = useContextMenu()

  // 树搜索选项（对等 Vue searchOptions computed）
  const treeSearchOptions = {
    text: searchText,
    caseSensitive: searchCaseSensitive,
    regex: searchRegex,
    searchColumns,
  }

  const getConnectionStatus = (id: string): ConnectionStatus => connectionStatuses.get(id) || 'disconnected'

  // 启动加载连接列表（对等 Vue 版 onMounted，含启动埋点）
  useEffect(() => {
    void (async () => {
      const finishFetchConnections = createStartupTimer('ConnectionPanel.fetchConnections')
      await useConnectionStore.getState().fetchConnections()
      await finishFetchConnections(`count=${useConnectionStore.getState().connections.length}`)
      await logStartupStage('ConnectionPanel ready')
    })()
  }, [])

  // Escape 关闭右键菜单
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') hideContextMenu() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [hideContextMenu])

  const filteredConnections = (() => {
    if (!searchText) return connections
    const text = searchText.toLowerCase()
    return connections.filter((c) => {
      const isMatched = c.name.toLowerCase().includes(text) || c.host.toLowerCase().includes(text)
      if (isMatched) return true
      // 已连接的连接在搜索时始终保留
      return getConnectionStatus(c.id) === 'connected'
    })
  })()

  const setExpanded = (id: string, expanded: boolean) => {
    setExpandedConnections((prev) => {
      const next = new Set(prev)
      if (expanded) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleConnectToDatabase = async (conn: ConnectionConfig) => {
    const store = useConnectionStore.getState()
    try {
      store.updateConnectionStatus(conn.id, 'connecting')
      await store.connectToDatabase(conn.id)
      if (useConnectionStore.getState().getConnectionStatus(conn.id) !== 'connected') {
        store.updateConnectionStatus(conn.id, 'error')
        return
      }
      store.setActiveConnection(conn.id)
      setExpanded(conn.id, true)
      void message.success(`${t('connection.success')}: ${conn.name}`)
    } catch (error: unknown) {
      store.updateConnectionStatus(conn.id, 'error')
      void message.error(`${t('connection.fail')}: ${getErrorMessage(error)}`)
    }
  }

  const handleDisconnect = async (conn: ConnectionConfig) => {
    const store = useConnectionStore.getState()
    try {
      await store.disconnectFromDatabase(conn.id)
      store.updateConnectionStatus(conn.id, 'disconnected')
      setExpanded(conn.id, false)
      void message.success(`${t('common.close')}: ${conn.name}`)
    } catch (error: unknown) {
      void message.error(getErrorMessage(error))
    }
  }

  const handleToggleExpand = async (conn: ConnectionConfig) => {
    if (getConnectionStatus(conn.id) !== 'connected') {
      await handleConnectToDatabase(conn)
      return
    }
    setExpanded(conn.id, !expandedConnections.has(conn.id))
  }

  const handleToggleConnection = async (conn: ConnectionConfig) => {
    if (getConnectionStatus(conn.id) === 'connected') {
      setExpanded(conn.id, !expandedConnections.has(conn.id))
    } else {
      await handleConnectToDatabase(conn)
    }
  }

  const getConnectionTooltip = (conn: ConnectionConfig): string => {
    const baseInfo = `${conn.db_type} • ${conn.host}:${conn.port}`
    const status = getConnectionStatus(conn.id)
    if (status === 'error') return `${baseInfo}\n⚠ ${t('connection.connection_lost')}`
    if (status === 'connecting') return `${baseInfo}\n⌛ ${t('connection.connecting')}`
    return baseInfo
  }

  const canCreateDatabase = selectedConnection ? selectedConnection.db_type?.toLowerCase() !== 'sqlite' : false
  const selectedStatus = selectedConnection ? getConnectionStatus(selectedConnection.id) : 'disconnected'

  const contextMenuItems: MenuProps['items'] = [
    ...(selectedStatus !== 'connected'
      ? [{ key: 'connect', label: <span><LinkOutlined /> {t('common.run')}</span> }]
      : [{ key: 'disconnect', label: <span><DisconnectOutlined /> {t('common.close')}</span> }]),
    ...(selectedStatus === 'connected' && canCreateDatabase
      ? [
          { type: 'divider' as const },
          { key: 'create-database', label: <span><DatabaseOutlined /> {t('common.new')}{t('common.database')}</span> },
        ]
      : []),
    { type: 'divider' as const },
    { key: 'edit', label: <span><EditOutlined /> {t('common.edit')}</span> },
    { key: 'delete', danger: true, label: <span><DeleteOutlined /> {t('common.delete')}</span> },
  ]

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    const conn = selectedConnection
    if (!conn) return
    hideContextMenu()
    if (key === 'connect') void handleConnectToDatabase(conn)
    else if (key === 'disconnect') void handleDisconnect(conn)
    else if (key === 'create-database') {
      if (selectedConnection) setCreateDatabaseTarget(selectedConnection)
    } else if (key === 'edit') onEditConnection?.(conn)
    else if (key === 'delete') {
      Modal.confirm({
        title: t('common.delete'),
        content: `${t('connection.delete_confirm')} "${conn.name}"?`,
        async onOk() {
          try {
            await useConnectionStore.getState().deleteConnection(conn.id)
            void message.success(t('common.save'))
          } catch (error: unknown) {
            void message.error(getErrorMessage(error))
          }
        },
      })
    }
  }

  return (
    <div className={styles.connectionPanel}>
      <div className="panel-toolbar panel-toolbar--muted-border">
        <span className="panel-toolbar__title">{t('connection.manager')}</span>
        <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => onAddConnection?.()}>
          {t('common.new')}
        </Button>
      </div>

      <div className={styles.panelContent}>
        <div className={styles.searchWrapper}>
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t('common.search')}
            size="small"
            variant="borderless"
            allowClear
            prefix={<SearchOutlined className={styles.searchPrefixIcon} />}
          />
          {searchText && (
            <div className={styles.searchOptions}>
              <Checkbox
                checked={searchCaseSensitive}
                onChange={(e) => setSearchCaseSensitive(e.target.checked)}
                className={styles.searchOptionItem}
              >
                {t('search.case_sensitive')}
              </Checkbox>
              <Checkbox
                checked={searchRegex}
                onChange={(e) => setSearchRegex(e.target.checked)}
                className={styles.searchOptionItem}
              >
                {t('search.regex')}
              </Checkbox>
              <Checkbox
                checked={searchColumns}
                onChange={(e) => setSearchColumns(e.target.checked)}
                className={styles.searchOptionItem}
              >
                {t('search.search_columns')}
              </Checkbox>
              {matchesCount > 0 && (
                <span className={styles.searchMatchCount}>{t('search.matches_count', { count: matchesCount })}</span>
              )}
            </div>
          )}
        </div>

        <div>
          {filteredConnections.map((conn) => {
            const status = getConnectionStatus(conn.id)
            const isExpanded = expandedConnections.has(conn.id)
            const accentStyle = { '--connection-accent': conn.color || 'transparent' } as CSSProperties
            const treeAccentStyle = { '--connection-accent': conn.color || 'var(--border-color)' } as CSSProperties
            return (
              <div key={conn.id} className={styles.connectionGroup}>
                <div
                  className={[
                    styles.connectionItem,
                    activeConnectionId === conn.id ? styles.connectionItemActive : '',
                    status === 'error' ? styles.connectionItemError : '',
                  ].join(' ')}
                  style={accentStyle}
                  title={getConnectionTooltip(conn)}
                  onClick={() => useConnectionStore.getState().setActiveConnection(conn.id)}
                  onDoubleClick={() => { void handleToggleConnection(conn) }}
                  onContextMenu={(e) => { setSelectedConnection(conn); showContextMenu(e) }}
                >
                  <div
                    className={styles.connectionExpandIcon}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (status === 'error') void handleConnectToDatabase(conn)
                      else void handleToggleExpand(conn)
                    }}
                  >
                    {status === 'error' ? (
                      <ReloadOutlined className={styles.reconnectIcon} />
                    ) : status === 'connected' && isExpanded ? (
                      <DownOutlined className={styles.expandIcon} />
                    ) : status === 'connected' ? (
                      <RightOutlined className={styles.expandIcon} />
                    ) : status === 'connecting' ? (
                      <LoadingOutlined className={`${styles.expandIcon} ${styles.connectingIcon}`} />
                    ) : (
                      <span className={styles.connectionIndentPlaceholder} />
                    )}
                  </div>

                  <div
                    className={[
                      styles.connectionIcon,
                      status !== 'connected' && status !== 'connecting' ? styles.connectionIconDimmed : '',
                    ].join(' ')}
                  >
                    <Icon icon={getBrandIcon(conn.db_type)} className={styles.brandIcon} />
                  </div>

                  <div className={`${styles.connectionName} ${status === 'error' ? styles.connectionNameError : ''}`}>
                    {conn.name}
                  </div>

                  <div className={styles.connectionActions}>
                    <Badge status={getStatusBadge(status)} />
                    {status === 'connected' && (
                      <DisconnectOutlined
                        className={styles.disconnectBtn}
                        onClick={(e) => { e.stopPropagation(); void handleDisconnect(conn) }}
                      />
                    )}
                    {status === 'error' && (
                      <LinkOutlined
                        className={styles.reconnectActionBtn}
                        onClick={(e) => { e.stopPropagation(); void handleConnectToDatabase(conn) }}
                      />
                    )}
                  </div>
                </div>

                {status === 'connected' && isExpanded && (
                  <div className={styles.databaseTreeWrapper} style={treeAccentStyle}>
                    <div className={styles.rootTreeLine} />
                    <DatabaseTree
                      connectionId={conn.id}
                      dbType={conn.db_type}
                      searchOptions={treeSearchOptions}
                      onUpdateMatchesCount={setMatchesCount}
                      onTableSelected={(data) => onTableSelected?.({ ...data, connectionId: conn.id })}
                      onDatabaseSelected={(data) => onDatabaseSelected?.({ ...data, connectionId: conn.id })}
                      onObjectSelected={(data) => onObjectSelected?.({ ...data, connectionId: conn.id })}
                      onNewQuery={(data) => onNewQuery?.(data)}
                      onGenerateSql={(data) => onGenerateSql?.(data)}
                      onDesignTable={(data) => onDesignTable?.({ ...data, connectionId: conn.id })}
                      onOpenErDiagram={(data) => onOpenErDiagram?.({ ...data, connectionId: conn.id })}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {filteredConnections.length === 0 && (
          <Empty
            description={t('connection.no_connections')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            className={styles.emptyConnections}
          />
        )}
      </div>

      {contextMenuVisible && (
        <div className="app-context-menu-overlay" onClick={() => hideContextMenu()}>
          <div
            className="app-context-menu"
            style={{ left: contextMenuX, top: contextMenuY }}
            onClick={(e) => e.stopPropagation()}
          >
            <Menu onClick={handleMenuClick} items={contextMenuItems} selectable={false} mode="inline" />
          </div>
        </div>
      )}

      <CreateDatabaseDialog
        open={Boolean(createDatabaseTarget)}
        connectionId={createDatabaseTarget?.id || ''}
        dbType={createDatabaseTarget?.db_type}
        onClose={() => setCreateDatabaseTarget(null)}
        onCreated={() => setCreateDatabaseTarget(null)}
      />
    </div>
  )
}
