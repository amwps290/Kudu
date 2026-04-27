import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ConnectionConfig, ConnectionStatus, StoredConnection } from '@/types/database'
import { connectionApi } from '@/api'
import { withErrorHandler } from '@/utils/errorHandler'
import { useAppStore } from './app'

interface ConnectToDatabaseOptions {
  showErrorMessage?: boolean
}

export const useConnectionStore = defineStore('connection', () => {
  const appStore = useAppStore()
  // 状态
  const connections = ref<ConnectionConfig[]>([])
  const activeConnectionId = ref<string | null>(null)
  const connectionStatuses = ref<Map<string, ConnectionStatus>>(new Map())
  let fetchConnectionsPromise: Promise<void> | null = null

  // 获取所有连接
  async function fetchConnections() {
    if (fetchConnectionsPromise) return fetchConnectionsPromise

    fetchConnectionsPromise = withErrorHandler(async () => {
      const loadedConnections = await connectionApi.getConnections()
      const previousStatuses = new Map(connectionStatuses.value)

      connections.value = loadedConnections
      connectionStatuses.value = new Map(
        loadedConnections.map(connection => [
          connection.id,
          previousStatuses.get(connection.id) || 'disconnected'
        ])
      )
    }, { messagePrefix: '获取连接列表失败' })
      .finally(() => {
        fetchConnectionsPromise = null
      })

    return fetchConnectionsPromise
  }

  /**
   * 将 ConnectionConfig 转换为存储格式
   */
  function toStoredConnection(config: ConnectionConfig, isNew: boolean = false): StoredConnection {
    return {
      id: config.id,
      name: config.name,
      db_type: config.db_type,
      host: config.host,
      port: config.port,
      username: config.username,
      database: config.database,
      ssl: config.ssl,
      connection_timeout: config.connection_timeout,
      pool_size: config.pool_size,
      mysql_charset: config.mysql_charset,
      mysql_init_sql: config.mysql_init_sql,
      read_only: config.read_only,
      color: config.color,
      tags: config.tags || [],
      created_at: isNew ? Date.now() : config.created_at,
      updated_at: Date.now(),
    }
  }

  function applyDatabaseDefaults(config: ConnectionConfig): ConnectionConfig {
    if (config.db_type !== 'mysql') {
      return config
    }

    return {
      ...config,
      mysql_charset: config.mysql_charset || appStore.databaseSettings.mysqlCharset || undefined,
      mysql_init_sql: config.mysql_init_sql ?? appStore.databaseSettings.mysqlInitSql ?? '',
    }
  }

  function getConnectionOverrides(config: ConnectionConfig) {
    if (config.db_type !== 'mysql') {
      return undefined
    }

    const normalizedConfig = applyDatabaseDefaults(config)
    return {
      mysql_charset: normalizedConfig.mysql_charset,
      mysql_init_sql: normalizedConfig.mysql_init_sql,
    }
  }

  // 保存连接
  async function saveConnection(config: ConnectionConfig, password?: string) {
    return withErrorHandler(async () => {
      const normalizedConfig = applyDatabaseDefaults(config)
      const storedConnection = toStoredConnection(normalizedConfig, true)
      const saved = await connectionApi.saveConnection(storedConnection, password || null)
      
      const index = connections.value.findIndex(c => c.id === saved.id)
      if (index >= 0) {
        connections.value[index] = { ...normalizedConfig, ...saved }
      } else {
        connections.value.push({ ...normalizedConfig, ...saved })
      }
      return saved
    }, { messagePrefix: '保存连接失败' })
  }

  // 更新连接
  async function updateConnection(config: ConnectionConfig, password?: string) {
    return withErrorHandler(async () => {
      const normalizedConfig = applyDatabaseDefaults(config)
      const storedConnection = toStoredConnection(normalizedConfig, false)
      const updated = await connectionApi.updateConnection(storedConnection, password || null)
      
      const index = connections.value.findIndex(c => c.id === config.id)
      if (index >= 0) {
        connections.value[index] = { ...normalizedConfig, ...updated }
      }
      return updated
    }, { messagePrefix: '更新连接失败' })
  }

  // 删除连接
  async function deleteConnection(id: string) {
    return withErrorHandler(async () => {
      await connectionApi.deleteConnection(id)
      connections.value = connections.value.filter(c => c.id !== id)
      if (activeConnectionId.value === id) {
        activeConnectionId.value = null
      }
      connectionStatuses.value.delete(id)
    }, { messagePrefix: '删除连接失败' })
  }

  // 测试连接
  async function testConnection(config: ConnectionConfig) {
    return withErrorHandler(async () => {
      const result = await connectionApi.testConnection(applyDatabaseDefaults(config))
      if (!result.success) {
        throw new Error(result.message || '连接失败')
      }
      return result
    }, { messagePrefix: '测试连接失败' })
  }

  // 连接到数据库
  async function connectToDatabase(id: string, options: ConnectToDatabaseOptions = {}) {
    const conn = connections.value.find(c => c.id === id)
    if (!conn) {
      throw new Error('连接配置不存在')
    }

    const { showErrorMessage = true } = options

    return withErrorHandler(async () => {
      updateConnectionStatus(id, 'connecting')
      await connectionApi.createConnection(id, getConnectionOverrides(conn))
      updateConnectionStatus(id, 'connected')
    }, {
      showMessage: showErrorMessage,
      messagePrefix: '连接数据库失败',
      onError: () => updateConnectionStatus(id, 'error')
    })
  }

  // 断开数据库连接
  async function disconnectFromDatabase(id: string) {
    return withErrorHandler(async () => {
      await connectionApi.disconnectDatabase(id)
      updateConnectionStatus(id, 'disconnected')
    }, { messagePrefix: '断开连接失败' })
  }

  // 设置活动连接
  function setActiveConnection(id: string | null) {
    activeConnectionId.value = id
  }

  // 更新连接状态
  function updateConnectionStatus(id: string, status: ConnectionStatus) {
    connectionStatuses.value.set(id, status)
  }

  // 获取连接状态
  function getConnectionStatus(id: string): ConnectionStatus {
    return connectionStatuses.value.get(id) || 'disconnected'
  }

  // 获取活动连接
  function getActiveConnection(): ConnectionConfig | null {
    if (!activeConnectionId.value) return null
    return connections.value.find(c => c.id === activeConnectionId.value) || null
  }

  return {
    connections,
    activeConnectionId,
    connectionStatuses,
    fetchConnections,
    saveConnection,
    updateConnection,
    deleteConnection,
    testConnection,
    connectToDatabase,
    disconnectFromDatabase,
    setActiveConnection,
    updateConnectionStatus,
    getConnectionStatus,
    getActiveConnection,
  }
})
