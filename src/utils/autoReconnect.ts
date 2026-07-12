import { connectionApi, type ConnectionOverrides } from '@/api/connection'
import { getErrorMessage } from '@/utils/errorHandler'
import type { ConnectionConfig, ConnectionStatus } from '@/types/database'

/**
 * 连接 store 访问器：由宿主在启动时注入（Vue 版包装 Pinia store，
 * React 版包装 Zustand 的 getState），使本模块不直接依赖任何状态库。
 * 未注入时自动重连整体禁用（失败直接抛出原始错误）。
 */
export interface AutoReconnectStoreAccess {
  getConnections(): ConnectionConfig[]
  getConnectionOverrides(config: ConnectionConfig): ConnectionOverrides | undefined
  updateConnectionStatus(id: string, status: ConnectionStatus): void
}

let storeAccessProvider: (() => AutoReconnectStoreAccess) | null = null

export function setAutoReconnectStoreProvider(provider: () => AutoReconnectStoreAccess) {
  storeAccessProvider = provider
}

const RETRYABLE_CONNECTION_PATTERNS = [
  /not connected/i,
  /未连接数据库/i,
  /connection .*closed/i,
  /connection closed/i,
  /connection reset/i,
  /broken pipe/i,
  /server has gone away/i,
  /lost connection/i,
  /connection refused/i,
  /network.*timeout/i,
  /network.*error/i,
  /eof/i,
  /socket/i,
  /timed out/i,
  /terminating connection/i,
  /connection abort/i,
  /connection lost/i,
]

const reconnectingTasks = new Map<string, Promise<void>>()

function getBaseConnectionId(connectionId: string) {
  return connectionId.split(':')[0] || connectionId
}

export function isRetryableConnectionError(error: unknown) {
  const message = getErrorMessage(error)
  return RETRYABLE_CONNECTION_PATTERNS.some(pattern => pattern.test(message))
}

function supportsAutoReconnect(connectionId: string) {
  const store = storeAccessProvider?.()
  if (!store) return false
  const conn = store.getConnections().find(item => item.id === connectionId)
  if (!conn) return false
  return conn.db_type === 'mysql' || conn.db_type === 'postgresql' || conn.db_type === 'opengauss' || conn.db_type === 'gaussdb'
}

async function reconnectConnection(connectionId: string) {
  const store = storeAccessProvider?.()
  if (!store) throw new Error('连接配置不存在')
  const conn = store.getConnections().find(item => item.id === connectionId)
  if (!conn) throw new Error('连接配置不存在')

  const existingTask = reconnectingTasks.get(connectionId)
  if (existingTask) {
    await existingTask
    return
  }

  const task = (async () => {
    store.updateConnectionStatus(connectionId, 'connecting')
    try {
      await connectionApi.disconnectDatabase(connectionId).catch(() => undefined)
      await connectionApi.createConnection(connectionId, store.getConnectionOverrides(conn))
      store.updateConnectionStatus(connectionId, 'connected')
    } catch (error) {
      store.updateConnectionStatus(connectionId, 'error')
      throw error
    } finally {
      reconnectingTasks.delete(connectionId)
    }
  })()

  reconnectingTasks.set(connectionId, task)
  await task
}

export async function withAutoReconnect<T>(connectionId: string, operation: () => Promise<T>, allowReconnectRetry = false) {
  try {
    return await operation()
  } catch (error) {
    const baseConnectionId = getBaseConnectionId(connectionId)
    if (!allowReconnectRetry || !baseConnectionId || !supportsAutoReconnect(baseConnectionId) || !isRetryableConnectionError(error)) {
      throw error
    }

    await reconnectConnection(baseConnectionId)
    return operation()
  }
}
