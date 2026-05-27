import { connectionApi } from '@/api/connection'
import { useConnectionStore } from '@/stores/connection'
import { getErrorMessage } from '@/utils/errorHandler'

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
  const store = useConnectionStore()
  const conn = store.connections.find(item => item.id === connectionId)
  if (!conn) return false
  return conn.db_type === 'mysql' || conn.db_type === 'postgresql' || conn.db_type === 'opengauss' || conn.db_type === 'gaussdb'
}

async function reconnectConnection(connectionId: string) {
  const store = useConnectionStore()
  const conn = store.connections.find(item => item.id === connectionId)
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
