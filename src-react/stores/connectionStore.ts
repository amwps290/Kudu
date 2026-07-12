import { create } from 'zustand'
import type { ConnectionConfig, ConnectionStatus, ConnectionTestResult, StoredConnection } from '@/types/database'
import { connectionApi } from '@/api'
import { queryApi } from '@/api/query'
import { withErrorHandler } from '@/utils/errorHandler'
import type { ConnectionOverrides } from '@/api/connection'
import i18next from '../i18n'
import { useAppStore } from './appStore'

/**
 * 连接 store（Zustand）。与 Pinia 版 stores/connection.ts 同名成员逐一对齐。
 * 范式差异：connectionStatuses / searchPaths 两个 Map 在 Pinia 版是原地
 * set/delete（Vue 深层响应式感知），这里必须**整体替换新 Map** 才能触发订阅更新。
 */

interface ConnectToDatabaseOptions {
  showErrorMessage?: boolean
}

const t = (key: string) => i18next.t(key)

// fetchConnections 并发去重（对等 Pinia 版模块内变量）
let fetchConnectionsPromise: Promise<void> | null = null

function toStoredConnection(config: ConnectionConfig, isNew = false): StoredConnection {
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

  const databaseSettings = useAppStore.getState().databaseSettings
  return {
    ...config,
    mysql_charset: config.mysql_charset || databaseSettings.mysqlCharset || undefined,
    mysql_init_sql: config.mysql_init_sql ?? databaseSettings.mysqlInitSql ?? '',
  }
}

interface ConnectionStoreState {
  connections: ConnectionConfig[]
  activeConnectionId: string | null
  connectionStatuses: Map<string, ConnectionStatus>
  searchPaths: Map<string, string>

  fetchConnections(): Promise<void>
  saveConnection(config: ConnectionConfig, password?: string): Promise<StoredConnection | undefined>
  updateConnection(config: ConnectionConfig, password?: string): Promise<StoredConnection | undefined>
  deleteConnection(id: string): Promise<void>
  testConnection(config: ConnectionConfig): Promise<ConnectionTestResult | undefined>
  connectToDatabase(id: string, options?: ConnectToDatabaseOptions): Promise<void>
  disconnectFromDatabase(id: string): Promise<void>
  setSearchPath(id: string, searchPath: string): void
  getSearchPath(id: string): string
  setActiveConnection(id: string | null): void
  updateConnectionStatus(id: string, status: ConnectionStatus): void
  getConnectionStatus(id: string): ConnectionStatus
  getActiveConnection(): ConnectionConfig | null
  getConnectionOverrides(config: ConnectionConfig): ConnectionOverrides | undefined
}

export const useConnectionStore = create<ConnectionStoreState>()((set, get) => ({
  connections: [],
  activeConnectionId: null,
  connectionStatuses: new Map(),
  searchPaths: new Map(),

  async fetchConnections() {
    if (fetchConnectionsPromise) return fetchConnectionsPromise

    fetchConnectionsPromise = withErrorHandler(async () => {
      const loadedConnections = await connectionApi.getConnections()
      const previousStatuses = get().connectionStatuses

      set({
        connections: loadedConnections,
        connectionStatuses: new Map(
          loadedConnections.map((connection) => [
            connection.id,
            previousStatuses.get(connection.id) || 'disconnected',
          ]),
        ),
      })
    }, { messagePrefix: t('connection.errors.fetch_list') })
      .then(() => undefined)
      .finally(() => {
        fetchConnectionsPromise = null
      })

    return fetchConnectionsPromise
  },

  async saveConnection(config, password) {
    return withErrorHandler(async () => {
      const normalizedConfig = applyDatabaseDefaults(config)
      const storedConnection = toStoredConnection(normalizedConfig, true)
      const saved = await connectionApi.saveConnection(storedConnection, password || null)

      const connections = [...get().connections]
      const index = connections.findIndex((c) => c.id === saved.id)
      if (index >= 0) {
        connections[index] = { ...normalizedConfig, ...saved }
      } else {
        connections.push({ ...normalizedConfig, ...saved })
      }
      set({ connections })
      return saved
    }, { messagePrefix: t('connection.errors.save') })
  },

  async updateConnection(config, password) {
    return withErrorHandler(async () => {
      const normalizedConfig = applyDatabaseDefaults(config)
      const storedConnection = toStoredConnection(normalizedConfig, false)
      const updated = await connectionApi.updateConnection(storedConnection, password || null)

      const connections = [...get().connections]
      const index = connections.findIndex((c) => c.id === config.id)
      if (index >= 0) {
        connections[index] = { ...normalizedConfig, ...updated }
        set({ connections })
      }
      return updated
    }, { messagePrefix: t('connection.errors.update') })
  },

  async deleteConnection(id) {
    await withErrorHandler(async () => {
      await connectionApi.deleteConnection(id)
      const connectionStatuses = new Map(get().connectionStatuses)
      connectionStatuses.delete(id)
      set({
        connections: get().connections.filter((c) => c.id !== id),
        activeConnectionId: get().activeConnectionId === id ? null : get().activeConnectionId,
        connectionStatuses,
      })
    }, { messagePrefix: t('connection.errors.delete') })
  },

  async testConnection(config) {
    return withErrorHandler(async () => {
      const result = await connectionApi.testConnection(applyDatabaseDefaults(config))
      if (!result.success) {
        throw new Error(result.message || t('connection.fail'))
      }
      return result
    }, { messagePrefix: t('connection.errors.test') })
  },

  async connectToDatabase(id, options = {}) {
    const conn = get().connections.find((c) => c.id === id)
    if (!conn) {
      throw new Error(t('connection.errors.config_missing'))
    }

    const { showErrorMessage = true } = options

    await withErrorHandler(async () => {
      get().updateConnectionStatus(id, 'connecting')
      await connectionApi.createConnection(id, get().getConnectionOverrides(conn))
      if (conn.db_type === 'postgresql' || conn.db_type === 'opengauss' || conn.db_type === 'gaussdb') {
        let searchPath = ''
        try {
          searchPath = await queryApi.getSearchPath(id)
        } catch {
          searchPath = ''
        }
        const searchPaths = new Map(get().searchPaths)
        searchPaths.set(id, searchPath)
        set({ searchPaths })
      } else {
        const searchPaths = new Map(get().searchPaths)
        searchPaths.delete(id)
        set({ searchPaths })
      }
      get().updateConnectionStatus(id, 'connected')
    }, {
      showMessage: showErrorMessage,
      messagePrefix: t('connection.errors.connect'),
      onError: () => get().updateConnectionStatus(id, 'error'),
    })
  },

  async disconnectFromDatabase(id) {
    await withErrorHandler(async () => {
      await connectionApi.disconnectDatabase(id)
      const searchPaths = new Map(get().searchPaths)
      searchPaths.delete(id)
      set({ searchPaths })
      get().updateConnectionStatus(id, 'disconnected')
    }, { messagePrefix: t('connection.errors.disconnect') })
  },

  setSearchPath(id, searchPath) {
    const searchPaths = new Map(get().searchPaths)
    searchPaths.set(id, searchPath)
    set({ searchPaths })
  },

  getSearchPath(id) {
    return get().searchPaths.get(id) || ''
  },

  setActiveConnection(id) {
    set({ activeConnectionId: id })
  },

  updateConnectionStatus(id, status) {
    const connectionStatuses = new Map(get().connectionStatuses)
    connectionStatuses.set(id, status)
    set({ connectionStatuses })
  },

  getConnectionStatus(id) {
    return get().connectionStatuses.get(id) || 'disconnected'
  },

  getActiveConnection() {
    const { activeConnectionId, connections } = get()
    if (!activeConnectionId) return null
    return connections.find((c) => c.id === activeConnectionId) || null
  },

  getConnectionOverrides(config) {
    if (config.db_type !== 'mysql') {
      return undefined
    }

    const normalizedConfig = applyDatabaseDefaults(config)
    return {
      mysql_charset: normalizedConfig.mysql_charset,
      mysql_init_sql: normalizedConfig.mysql_init_sql,
    }
  },
}))
