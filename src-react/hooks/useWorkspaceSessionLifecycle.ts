import { useCallback, useRef } from 'react'
import type { DataTab } from './useTabManager'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useConnectionStore } from '../stores/connectionStore'
import { utilsApi } from '@/api'
import { createStartupTimer, logStartupStage } from '@/utils/startupProfiler'

/**
 * 工作区会话生命周期 hook（对等 Vue 版 useWorkspaceSessionLifecycle，流程逐行平移）：
 * - scheduleSessionSave：800ms 防抖落盘（isRestoring 时不调度；store 落盘前再拦一次——双重防回写）
 * - restoreSession：加载会话 → 有 filePath 的 query tab 重读磁盘 → 应用 tabs →
 *   连接列表为空则 fetchConnections → 450ms 后并发静默重连相关连接；
 *   空会话/异常时回退创建默认查询 tab（仅 SQL 引擎）
 * - cleanup：清理两个计时器
 *
 * 范式差异：Vue 版计时器回调经 ref 读到最新 tabs；React 侧 options 每次渲染
 * 刷新进 latestRef，回调统一从 latestRef.current 取值，语义等价。
 * store 经 getState() 访问（Zustand 组件外访问是一等公民）。
 */

interface SessionLifecycleOptions {
  dataTabs: DataTab[]
  mainTabKey: string
  isSqlSupported: boolean
  /** 恢复会话时整体替换 tabs 与激活 key（对等 Vue 版直接写 dataTabs/mainTabKey ref） */
  applyRestoredSession: (tabs: DataTab[], activeKey: string) => void
  openOrCreateQueryTab: (payload: { connectionId?: string; database?: string; filePath?: string; title?: string; content?: string }) => Promise<boolean>
}

function collectSessionConnectionIds(tabs: DataTab[]) {
  return [...new Set(tabs.map(tab => tab.connectionId).filter((id): id is string => Boolean(id)))]
}

/** 有 filePath 的 query tab 从磁盘重读内容（读失败保持会话内容），dirty 归零 */
async function restoreSessionQueryTabs(tabs: DataTab[]) {
  const restoredTabs = await Promise.all(tabs.map(async (tab) => {
    if (tab.type !== 'query' || !tab.filePath || tab.isUntitled) return tab

    try {
      const content = await utilsApi.readFile(tab.filePath)
      return {
        ...tab,
        content,
        dirty: false,
      }
    } catch {
      return {
        ...tab,
        dirty: false,
      }
    }
  }))

  return restoredTabs
}

export function useWorkspaceSessionLifecycle(options: SessionLifecycleOptions) {
  const latestRef = useRef(options)
  latestRef.current = options

  const sessionReconnectTimerRef = useRef<number | null>(null)
  const sessionSaveTimerRef = useRef<number | null>(null)

  const scheduleSessionSave = useCallback(() => {
    if (useWorkspaceStore.getState().isRestoring) return
    if (sessionSaveTimerRef.current) clearTimeout(sessionSaveTimerRef.current)
    sessionSaveTimerRef.current = window.setTimeout(() => {
      sessionSaveTimerRef.current = null
      const { dataTabs, mainTabKey } = latestRef.current
      void useWorkspaceStore.getState().saveSession(dataTabs, mainTabKey)
    }, 800)
  }, [])

  const clearSessionReconnectTimer = useCallback(() => {
    if (sessionReconnectTimerRef.current !== null) {
      clearTimeout(sessionReconnectTimerRef.current)
      sessionReconnectTimerRef.current = null
    }
  }, [])

  const clearSessionSaveTimer = useCallback(() => {
    if (sessionSaveTimerRef.current !== null) {
      clearTimeout(sessionSaveTimerRef.current)
      sessionSaveTimerRef.current = null
    }
  }, [])

  const scheduleSessionReconnect = useCallback((connectionIds: string[]) => {
    clearSessionReconnectTimer()
    if (connectionIds.length === 0) return

    void logStartupStage('sessionReconnect:scheduled', `count=${connectionIds.length}`, true)

    sessionReconnectTimerRef.current = window.setTimeout(async () => {
      const finishReconnect = createStartupTimer('sessionReconnect.total')
      sessionReconnectTimerRef.current = null
      // Vue 版此处 await nextTick() 等恢复的 tabs 完成渲染；
      // React 侧 450ms 计时器触发时恢复引发的渲染早已提交，无需对应操作
      const connectionStore = useConnectionStore.getState()

      await Promise.allSettled(
        connectionIds.map(async (id) => {
          const conn = connectionStore.connections.find(item => item.id === id)
          if (!conn || connectionStore.getConnectionStatus(id) === 'connected') return
          const finish = createStartupTimer(`sessionReconnect.${id}`)
          await connectionStore.connectToDatabase(id, { showErrorMessage: false }).catch(() => {})
          await finish(conn.name)
        })
      )

      await finishReconnect(`count=${connectionIds.length}`)
    }, 450)
  }, [clearSessionReconnectTimer])

  const restoreSession = useCallback(async () => {
    useWorkspaceStore.getState().setIsRestoring(true)
    const finishRestore = createStartupTimer('restoreSession')
    let pendingReconnectIds: string[] = []
    try {
      await logStartupStage('restoreSession:start')
      const session = await useWorkspaceStore.getState().loadSession()
      await logStartupStage('restoreSession:session-loaded', session ? `tabs=${session.open_tabs.length}` : 'tabs=0')
      if (session && session.open_tabs.length > 0) {
        const restoredTabs = await restoreSessionQueryTabs(session.open_tabs)
        latestRef.current.applyRestoredSession(restoredTabs, session.active_tab_key)
        await logStartupStage('restoreSession:tabs-applied', `active=${session.active_tab_key}`)
        if (useConnectionStore.getState().connections.length === 0) {
          const finishFetchConnections = createStartupTimer('restoreSession.fetchConnections')
          await useConnectionStore.getState().fetchConnections()
          await finishFetchConnections(`count=${useConnectionStore.getState().connections.length}`)
        }
        // Vue 版在赋值后从 dataTabs ref 收集；React 的 setState 尚未回流到本渲染，
        // 直接用同一份 restoredTabs（与 Vue 赋值后的 ref 内容一致）
        pendingReconnectIds = collectSessionConnectionIds(restoredTabs)
        await logStartupStage('restoreSession:pending-reconnects', pendingReconnectIds.join(',') || 'none')
      } else if (latestRef.current.isSqlSupported) {
        await latestRef.current.openOrCreateQueryTab({})
        await logStartupStage('restoreSession:created-default-query')
      }
    } catch {
      if (latestRef.current.isSqlSupported) await latestRef.current.openOrCreateQueryTab({})
      await logStartupStage('restoreSession:error-fallback', undefined, true)
    } finally {
      useWorkspaceStore.getState().setIsRestoring(false)
      scheduleSessionReconnect(pendingReconnectIds)
      await finishRestore(`reconnects=${pendingReconnectIds.length}`)
    }
  }, [scheduleSessionReconnect])

  const cleanup = useCallback(() => {
    clearSessionReconnectTimer()
    clearSessionSaveTimer()
  }, [clearSessionReconnectTimer, clearSessionSaveTimer])

  return {
    scheduleSessionSave,
    restoreSession,
    cleanup,
  }
}
