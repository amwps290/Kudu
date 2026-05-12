import { nextTick, onMounted, onUnmounted, watch, type Ref } from 'vue'
import { TabType } from '@/types/workspace'
import type { DataTab } from '@/composables/useTabManager'
import { logStartupStage } from '@/utils/startupProfiler'

interface WorkspacePageLifecycleOptions {
  dataTabs: Ref<DataTab[]>
  mainTabKey: Ref<string>
  activeTabType: Ref<TabType | undefined>
  callActiveEditor: (method: string, ...args: unknown[]) => unknown
  restoreSession: () => void | Promise<void>
  sessionCleanup: () => void
  setupClipboardRouting: () => void
  cleanupClipboardRouting: () => void
  setupWindowCloseGuard: () => Promise<void>
  cleanupWindowCloseGuard: () => void
}

export function useWorkspacePageLifecycle(options: WorkspacePageLifecycleOptions) {
  watch(options.mainTabKey, async () => {
    await nextTick()
    if (options.activeTabType.value === TabType.Query) {
      window.setTimeout(() => options.callActiveEditor('focusEditor'), 0)
    }
  })

  function handleEditorDatabaseChange(tabKey: string, database: string) {
    const tab = options.dataTabs.value.find(item => item.key === tabKey)
    if (tab) tab.database = database
  }

  onMounted(async () => {
    await logStartupStage('HomeView mounted')
    options.setupClipboardRouting()
    await options.setupWindowCloseGuard()
    options.restoreSession()
  })

  onUnmounted(() => {
    options.sessionCleanup()
    options.cleanupWindowCloseGuard()
    options.cleanupClipboardRouting()
  })

  return {
    handleEditorDatabaseChange,
  }
}
