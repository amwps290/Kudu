import { useCallback, useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * 窗口控制 hook（对等 Vue 版 useWindowControls）。
 * 差异：Vue 版 setupMaximizeListener 的 onResized unlisten 从不清理（已知泄漏），
 * 这里在 effect cleanup 中正确释放；浏览器（非 Tauri）环境下降级为 no-op，方便网页端调试。
 */
export function useWindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)

  const minimizeWindow = useCallback(async () => {
    if (!isTauriRuntime()) return
    try { await getCurrentWindow().minimize() } catch { /* ignore */ }
  }, [])

  const toggleMaximize = useCallback(async () => {
    if (!isTauriRuntime()) return
    try {
      const appWindow = getCurrentWindow()
      await appWindow.toggleMaximize()
      setIsMaximized(await appWindow.isMaximized())
    } catch { /* ignore */ }
  }, [])

  const closeWindow = useCallback(async () => {
    if (!isTauriRuntime()) return
    try { await getCurrentWindow().close() } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!isTauriRuntime()) return
    const appWindow = getCurrentWindow()
    let disposed = false
    let unlisten: (() => void) | undefined

    appWindow.isMaximized()
      .then((value) => { if (!disposed) setIsMaximized(value) })
      .catch(() => undefined)

    appWindow.onResized(async () => {
      try { setIsMaximized(await appWindow.isMaximized()) } catch { /* ignore */ }
    })
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  return { isMaximized, minimizeWindow, toggleMaximize, closeWindow }
}
