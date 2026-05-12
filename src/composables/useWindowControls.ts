import { ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function useWindowControls() {
  const appWindow = getCurrentWindow()
  const isMaximized = ref(false)

  async function minimizeWindow() {
    try { await appWindow.minimize() } catch { /* ignore */ }
  }

  async function toggleMaximize() {
    try {
      await appWindow.toggleMaximize()
      isMaximized.value = await appWindow.isMaximized()
    } catch { /* ignore */ }
  }

  async function closeWindow() {
    try { await appWindow.close() } catch { /* ignore */ }
  }

  function setupMaximizeListener() {
    appWindow.isMaximized().then(v => { isMaximized.value = v }).catch(() => undefined)
    appWindow.onResized(async () => {
      try { isMaximized.value = await appWindow.isMaximized() } catch { /* ignore */ }
    })
  }

  return { isMaximized, minimizeWindow, toggleMaximize, closeWindow, setupMaximizeListener }
}
