import { ref, onUnmounted } from 'vue'
import { connectionApi, type ConnectionHealthResult } from '@/api/connection'
import { useConnectionStore } from '@/stores/connection'

const DEFAULT_POLL_INTERVAL_MS = 10_000

/**
 * 连接健康状态监控 composable
 *
 * 每 10 秒对已连接 (connected/error) 的连接进行轻量 ping，
 * 如果 ping 失败则将状态更新为 'error'，成功则恢复为 'connected'。
 * 这样断开的连接可以自动恢复，无需手动重连。
 */
export function useConnectionHealthMonitor(options?: {
  pollIntervalMs?: number
}) {
  const intervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const connectionStore = useConnectionStore()
  const isMonitoring = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null

  async function checkConnectionHealth(connectionId: string): Promise<void> {
    try {
      const result: ConnectionHealthResult = await connectionApi.checkConnectionHealth(connectionId)

      if (!result.alive) {
        const currentStatus = connectionStore.getConnectionStatus(connectionId)
        if (currentStatus === 'connected') {
          connectionStore.updateConnectionStatus(connectionId, 'error')
          console.warn(
            `[health-monitor] 连接 "${connectionId}" 健康检查失败: ${result.error || '未知错误'}`,
          )
        }
      } else {
        const currentStatus = connectionStore.getConnectionStatus(connectionId)
        if (currentStatus === 'error') {
          connectionStore.updateConnectionStatus(connectionId, 'connected')
          console.info(
            `[health-monitor] 连接 "${connectionId}" 已恢复正常 (${result.latency_ms}ms)`,
          )
        }
      }
    } catch (error: unknown) {
      const currentStatus = connectionStore.getConnectionStatus(connectionId)
      if (currentStatus === 'connected') {
        connectionStore.updateConnectionStatus(connectionId, 'error')
        console.warn(`[health-monitor] 连接 "${connectionId}" 健康检查异常:`, error)
      }
    }
  }

  /**
   * 轮询所有状态为 connected/error 的连接
   */
  async function poll(): Promise<void> {
    if (!isMonitoring.value) return

    const connectedIds: string[] = []
    connectionStore.connections.forEach((conn) => {
      const status = connectionStore.getConnectionStatus(conn.id)
      if (status === 'connected' || status === 'error') {
        connectedIds.push(conn.id)
      }
    })

    if (connectedIds.length === 0) return

    await Promise.allSettled(connectedIds.map((id) => checkConnectionHealth(id)))
  }

  function start(): void {
    if (timer !== null) return
    isMonitoring.value = true
    poll()
    timer = setInterval(poll, intervalMs)
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
    isMonitoring.value = false
  }

  function restart(): void {
    stop()
    start()
  }

  onUnmounted(() => {
    stop()
  })

  return {
    isMonitoring,
    start,
    stop,
    restart,
    poll,
  }
}
