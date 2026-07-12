import { useCallback, useEffect, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Modal } from '../ui/antd'
import { TabType } from '@/types/workspace'
import type { DataTab } from './useTabManager'

/**
 * 关闭保护（对等 Vue 版 useWorkspaceCloseGuards）。
 * 脏 query tab 关闭三按钮确认（取消/放弃/保存）；窗口关闭拦截 → 逐个激活脏 tab 确认 → 全过后 destroy。
 * Vue 用 h() 自定义 footer；React 用 Modal.confirm + footer 数组渲染三个 antd 按钮。
 */

interface CloseGuardsOptions {
  dataTabs: DataTab[]
  setMainTabKey: (key: string) => void
  findTabByKey: (key: string) => DataTab | undefined
  saveQueryTab: (key: string) => Promise<boolean>
  closeTab: (key: string) => void
  removeTabs: (keys: Iterable<string>, fallbackActiveKey?: string) => void
  t: (key: string, options?: Record<string, unknown>) => string
}

export function useWorkspaceCloseGuards(options: CloseGuardsOptions) {
  const latestRef = useRef(options)
  latestRef.current = options
  const unlistenRef = useRef<(() => void) | null>(null)
  const forceClosingRef = useRef(false)

  function getDirtyQueryTab(tabKey: string) {
    const tab = latestRef.current.findTabByKey(tabKey)
    if (!tab || tab.type !== TabType.Query || !tab.dirty) return null
    return tab
  }

  const getDirtyQueryTabs = useCallback((tabKeys?: string[]) => {
    const targetKeys = tabKeys ? new Set(tabKeys) : null
    return latestRef.current.dataTabs.filter((tab) =>
      tab.type === TabType.Query && tab.dirty && (!targetKeys || targetKeys.has(tab.key)),
    )
  }, [])

  function confirmCloseDirtyQueryTab(tabKey: string): Promise<boolean> {
    const tab = getDirtyQueryTab(tabKey)
    if (!tab) return Promise.resolve(true)
    const { t } = latestRef.current

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
        title: t('editor.unsaved_close_title'),
        content: (
          <div className="workspace-unsaved-confirm__content">
            <div className="workspace-unsaved-confirm__message">
              {t('editor.unsaved_close_confirm', { title: tab.title })}
            </div>
            <div className="workspace-unsaved-confirm__hint">
              {t('editor.unsaved_close_hint')}
            </div>
          </div>
        ),
        closable: false,
        maskClosable: false,
        keyboard: false,
        centered: true,
        width: 430,
        wrapClassName: 'workspace-unsaved-confirm',
        icon: null,
        footer: (
          <div className="workspace-unsaved-confirm__footer">
            <button
              className="ant-btn ant-btn-default workspace-unsaved-confirm__button"
              type="button"
              onClick={() => finish(false)}
            >
              {t('common.cancel')}
            </button>
            <button
              className="ant-btn ant-btn-default workspace-unsaved-confirm__button"
              type="button"
              onClick={() => finish(true)}
            >
              {t('editor.discard_changes')}
            </button>
            <button
              className="ant-btn ant-btn-primary workspace-unsaved-confirm__button"
              type="button"
              onClick={async () => {
                try {
                  const saved = await latestRef.current.saveQueryTab(tab.key)
                  if (saved) finish(true)
                } catch {
                  finish(false)
                }
              }}
            >
              {t('common.save')}
            </button>
          </div>
        ),
      })
    })
  }

  const closeTabWithConfirm = useCallback(async (tabKey: string) => {
    const canClose = await confirmCloseDirtyQueryTab(tabKey)
    if (!canClose) return false
    latestRef.current.closeTab(tabKey)
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeTabsWithConfirm = useCallback(async (keys: string[], fallbackActiveKey?: string) => {
    const dirtyTabs = keys.map((key) => getDirtyQueryTab(key)).filter((tab): tab is DataTab => Boolean(tab))
    for (const tab of dirtyTabs) {
      latestRef.current.setMainTabKey(tab.key)
      const canClose = await confirmCloseDirtyQueryTab(tab.key)
      if (!canClose) return false
    }
    latestRef.current.removeTabs(keys, fallbackActiveKey)
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 窗口关闭拦截（挂载时绑定，卸载时解绑）
  useEffect(() => {
    const appWindow = getCurrentWindow()
    let disposed = false

    async function handleWindowCloseRequested() {
      const dirtyTabs = getDirtyQueryTabs()
      if (dirtyTabs.length === 0) return true
      for (const tab of dirtyTabs) {
        latestRef.current.setMainTabKey(tab.key)
        const canClose = await confirmCloseDirtyQueryTab(tab.key)
        if (!canClose) return false
      }
      return true
    }

    void appWindow.onCloseRequested(async (event) => {
      if (forceClosingRef.current) return
      event.preventDefault()
      const canClose = await handleWindowCloseRequested()
      if (!canClose) return
      forceClosingRef.current = true
      window.setTimeout(() => {
        void appWindow.destroy().catch((error) => {
          console.error('[WindowCloseGuard] failed to destroy window after approval', error)
          forceClosingRef.current = false
        })
      }, 0)
    }).then((unlisten) => {
      if (disposed) unlisten()
      else unlistenRef.current = unlisten
    })

    return () => {
      disposed = true
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
      forceClosingRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    getDirtyQueryTabs,
    closeTabWithConfirm,
    closeTabsWithConfirm,
  }
}
