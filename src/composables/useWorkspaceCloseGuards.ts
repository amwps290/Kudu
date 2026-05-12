import { h, nextTick, type Ref } from 'vue'
import { Modal } from '@/ui/antd'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { TabType } from '@/types/workspace'
import type { DataTab } from '@/composables/useTabManager'

interface ConfirmCloseOptions {
  dataTabs: Ref<DataTab[]>
  mainTabKey: Ref<string>
  findTabByKey: (key: string) => DataTab | undefined
  callActiveEditor: (method: string, ...args: unknown[]) => unknown
  closeTab: (key: string) => void
  removeTabs: (keys: Iterable<string>, fallbackActiveKey?: string) => void
  t: (key: string, options?: Record<string, unknown>) => string
}

export function useWorkspaceCloseGuards(options: ConfirmCloseOptions) {
  const appWindow = getCurrentWindow()
  let unlistenCloseRequested: (() => void) | null = null
  let forceClosingWindow = false

  function getDirtyQueryTab(tabKey: string) {
    const tab = options.findTabByKey(tabKey)
    if (!tab || tab.type !== TabType.Query || !tab.dirty) return null
    return tab
  }

  function getDirtyQueryTabs(tabKeys?: string[]) {
    const targetKeys = tabKeys ? new Set(tabKeys) : null
    return options.dataTabs.value.filter(tab =>
      tab.type === TabType.Query &&
      tab.dirty &&
      (!targetKeys || targetKeys.has(tab.key))
    )
  }

  async function confirmCloseDirtyQueryTab(tabKey: string) {
    const tab = getDirtyQueryTab(tabKey)
    if (!tab) return true

    return new Promise<boolean>((resolve) => {
      let resolved = false
      let modal: { destroy: () => void } | null = null

      const finish = (result: boolean) => {
        if (resolved) return
        resolved = true
        resolve(result)
        modal?.destroy()
      }

      modal = Modal.confirm({
        title: options.t('common.warning'),
        content: options.t('editor.unsaved_close_confirm', { title: tab.title }),
        closable: false,
        maskClosable: false,
        keyboard: false,
        icon: () => null,
        footer: () => [
          h('button', {
            class: 'ant-btn ant-btn-default',
            type: 'button',
            onClick: () => finish(false),
          }, options.t('common.cancel')),
          h('button', {
            class: 'ant-btn ant-btn-default',
            type: 'button',
            onClick: () => finish(true),
          }, options.t('editor.discard_changes')),
          h('button', {
            class: 'ant-btn ant-btn-primary',
            type: 'button',
            onClick: async () => {
              try {
                const saved = await (options.callActiveEditor('handleSave') as Promise<boolean> | undefined)
                if (saved) {
                  finish(true)
                }
              } catch {
                finish(false)
              }
            },
          }, options.t('common.save')),
        ],
      })
    })
  }

  async function closeTabWithConfirm(tabKey: string) {
    const canClose = await confirmCloseDirtyQueryTab(tabKey)
    if (!canClose) return false
    options.closeTab(tabKey)
    return true
  }

  async function closeTabsWithConfirm(keys: string[], fallbackActiveKey?: string) {
    const dirtyTabs = keys
      .map(key => getDirtyQueryTab(key))
      .filter((tab): tab is DataTab => Boolean(tab))

    for (const tab of dirtyTabs) {
      options.mainTabKey.value = tab.key
      await nextTick()
      const canClose = await confirmCloseDirtyQueryTab(tab.key)
      if (!canClose) {
        return false
      }
    }

    options.removeTabs(keys, fallbackActiveKey)
    return true
  }

  async function handleWindowCloseRequested() {
    const dirtyTabs = getDirtyQueryTabs()
    if (dirtyTabs.length === 0) return true

    for (const tab of dirtyTabs) {
      options.mainTabKey.value = tab.key
      await nextTick()
      const canClose = await confirmCloseDirtyQueryTab(tab.key)
      if (!canClose) {
        return false
      }
    }

    return true
  }

  async function setupWindowCloseGuard() {
    unlistenCloseRequested = await appWindow.onCloseRequested(async (event) => {
      if (forceClosingWindow) {
        console.info('[WindowCloseGuard] force close request passthrough')
        return
      }

      event.preventDefault()
      console.info('[WindowCloseGuard] intercepted close request')
      const canClose = await handleWindowCloseRequested()
      if (!canClose) {
        console.info('[WindowCloseGuard] close cancelled by guard')
        return
      }

      forceClosingWindow = true
      console.info('[WindowCloseGuard] close approved, destroying window directly')
      window.setTimeout(() => {
        void appWindow.destroy().catch((error) => {
          console.error('[WindowCloseGuard] failed to destroy window after approval', error)
          forceClosingWindow = false
        })
      }, 0)
    })
  }

  function cleanupWindowCloseGuard() {
    if (unlistenCloseRequested) {
      unlistenCloseRequested()
      unlistenCloseRequested = null
    }
    forceClosingWindow = false
  }

  return {
    getDirtyQueryTabs,
    confirmCloseDirtyQueryTab,
    closeTabWithConfirm,
    closeTabsWithConfirm,
    setupWindowCloseGuard,
    cleanupWindowCloseGuard,
  }
}
