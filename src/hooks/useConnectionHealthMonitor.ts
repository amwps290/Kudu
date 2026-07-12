import { useCallback, useEffect, useRef } from 'react'
import { connectionApi, type ConnectionHealthResult } from '@/api/connection'
import { useConnectionStore } from '../stores/connectionStore'

const DEFAULT_POLL_INTERVAL_MS = 10_000

/**
 * 连接健康状态监控 hook（对等 Vue 版 useConnectionHealthMonitor）。
 *
 * 每 10 秒对状态为 connected/error 的连接做轻量 ping：
 * ping 失败 → 'error'；恢复成功 → 'connected'（无需手动重连）。
 * store 通过 getState() 读取，轮询始终拿到最新状态。
 */
export function useConnectionHealthMonitor(options?: {
  pollIntervalMs?: number
}) {
  const intervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMonitoringRef = useRef(false)

  const checkConnectionHealth = useCallback(async (connectionId: string): Promise<void> => {
    const store = useConnectionStore.getState()
    try {
      const result: ConnectionHealthResult = await connectionApi.checkConnectionHealth(connectionId)

      if (!result.alive) {
        if (store.getConnectionStatus(connectionId) === 'connected') {
          store.updateConnectionStatus(connectionId, 'error')
          console.warn(
            `[health-monitor] 连接 "${connectionId}" 健康检查失败: ${result.error || '未知错误'}`,
          )
        }
      } else {
        if (store.getConnectionStatus(connectionId) === 'error') {
          store.updateConnectionStatus(connectionId, 'connected')
          console.info(
            `[health-monitor] 连接 "${connectionId}" 已恢复正常 (${result.latency_ms}ms)`,
          )
        }
      }
    } catch (error: unknown) {
      if (store.getConnectionStatus(connectionId) === 'connected') {
        store.updateConnectionStatus(connectionId, 'error')
        console.warn(`[health-monitor] 连接 "${connectionId}" 健康检查异常:`, error)
      }
    }
  }, [])

  const poll = useCallback(async (): Promise<void> => {
    if (!isMonitoringRef.current) return

    const store = useConnectionStore.getState()
    const connectedIds: string[] = []
    store.connections.forEach((conn) => {
      const status = store.getConnectionStatus(conn.id)
      if (status === 'connected' || status === 'error') {
        connectedIds.push(conn.id)
      }
    })

    if (connectedIds.length === 0) return

    await Promise.allSettled(connectedIds.map((id) => checkConnectionHealth(id)))
  }, [checkConnectionHealth])

  const start = useCallback((): void => {
    if (timerRef.current !== null) return
    isMonitoringRef.current = true
    void poll()
    timerRef.current = setInterval(() => { void poll() }, intervalMs)
  }, [intervalMs, poll])

  const stop = useCallback((): void => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    isMonitoringRef.current = false
  }, [])

  const restart = useCallback((): void => {
    stop()
    start()
  }, [start, stop])

  // 对等 Vue 版 onUnmounted(stop)
  useEffect(() => stop, [stop])

  return { start, stop, restart, poll }
}
