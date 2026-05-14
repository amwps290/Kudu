import { nextTick, type Ref } from 'vue'
import type { DataTab } from '@/composables/useTabManager'
import type { ReturnTypeUseWorkspaceStore } from '@/types/internal'
import type { ReturnTypeUseConnectionStore } from '@/types/internal'
import { utilsApi } from '@/api'
import { createStartupTimer, logStartupStage } from '@/utils/startupProfiler'

interface SessionLifecycleOptions {
  workspaceStore: ReturnTypeUseWorkspaceStore
  connectionStore: ReturnTypeUseConnectionStore
  dataTabs: Ref<DataTab[]>
  mainTabKey: Ref<string>
  isSqlSupported: Ref<boolean>
  openOrCreateQueryTab: (payload: { connectionId?: string; database?: string; filePath?: string; title?: string; content?: string }) => Promise<boolean>
}

export function useWorkspaceSessionLifecycle(options: SessionLifecycleOptions) {
  let sessionReconnectTimer: number | null = null
  let sessionSaveTimer: number | null = null

  function collectSessionConnectionIds(tabs: DataTab[]) {
    return [...new Set(tabs.map(tab => tab.connectionId).filter((id): id is string => Boolean(id)))]
  }

  function scheduleSessionSave() {
    if (options.workspaceStore.isRestoring) return
    if (sessionSaveTimer) clearTimeout(sessionSaveTimer)
    sessionSaveTimer = window.setTimeout(() => {
      sessionSaveTimer = null
      void options.workspaceStore.saveSession(options.dataTabs.value, options.mainTabKey.value)
    }, 800)
  }

  function clearSessionReconnectTimer() {
    if (sessionReconnectTimer !== null) {
      clearTimeout(sessionReconnectTimer)
      sessionReconnectTimer = null
    }
  }

  function clearSessionSaveTimer() {
    if (sessionSaveTimer !== null) {
      clearTimeout(sessionSaveTimer)
      sessionSaveTimer = null
    }
  }

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

  function scheduleSessionReconnect(connectionIds: string[]) {
    clearSessionReconnectTimer()
    if (connectionIds.length === 0) return

    void logStartupStage('sessionReconnect:scheduled', `count=${connectionIds.length}`, true)

    sessionReconnectTimer = window.setTimeout(async () => {
      const finishReconnect = createStartupTimer('sessionReconnect.total')
      sessionReconnectTimer = null
      await nextTick()

      await Promise.allSettled(
        connectionIds.map(async (id) => {
          const conn = options.connectionStore.connections.find(item => item.id === id)
          if (!conn || options.connectionStore.getConnectionStatus(id) === 'connected') return
          const finish = createStartupTimer(`sessionReconnect.${id}`)
          await options.connectionStore.connectToDatabase(id, { showErrorMessage: false }).catch(() => {})
          await finish(conn.name)
        })
      )

      await finishReconnect(`count=${connectionIds.length}`)
    }, 450)
  }

  async function restoreSession() {
    options.workspaceStore.isRestoring = true
    const finishRestore = createStartupTimer('restoreSession')
    let pendingReconnectIds: string[] = []
    try {
      await logStartupStage('restoreSession:start')
      const session = await options.workspaceStore.loadSession()
      await logStartupStage('restoreSession:session-loaded', session ? `tabs=${session.open_tabs.length}` : 'tabs=0')
      if (session && session.open_tabs.length > 0) {
        const restoredTabs = await restoreSessionQueryTabs(session.open_tabs.map(tab => ({
          ...tab,
          type: tab.type,
        })) as DataTab[])
        options.dataTabs.value = restoredTabs
        options.mainTabKey.value = session.active_tab_key
        await logStartupStage('restoreSession:tabs-applied', `active=${session.active_tab_key}`)
        if (options.connectionStore.connections.length === 0) {
          const finishFetchConnections = createStartupTimer('restoreSession.fetchConnections')
          await options.connectionStore.fetchConnections()
          await finishFetchConnections(`count=${options.connectionStore.connections.length}`)
        }
        pendingReconnectIds = collectSessionConnectionIds(options.dataTabs.value)
        await logStartupStage('restoreSession:pending-reconnects', pendingReconnectIds.join(',') || 'none')
      } else if (options.isSqlSupported.value) {
        await options.openOrCreateQueryTab({})
        await logStartupStage('restoreSession:created-default-query')
      }
    } catch {
      if (options.isSqlSupported.value) await options.openOrCreateQueryTab({})
      await logStartupStage('restoreSession:error-fallback', undefined, true)
    } finally {
      options.workspaceStore.isRestoring = false
      scheduleSessionReconnect(pendingReconnectIds)
      await finishRestore(`reconnects=${pendingReconnectIds.length}`)
    }
  }

  function cleanup() {
    clearSessionReconnectTimer()
    clearSessionSaveTimer()
  }

  return {
    scheduleSessionSave,
    restoreSession,
    cleanup,
  }
}
