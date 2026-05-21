import { ref } from 'vue'

export function useSidebarResize(initialWidth = 280, minWidth = 200, maxWidth = 600) {
  const sidebarWidth = ref(initialWidth)

  function setGlobalResizeState(active: boolean) {
    document.body.style.cursor = active ? 'col-resize' : ''
    document.body.style.userSelect = active ? 'none' : ''
    document.body.style.webkitUserSelect = active ? 'none' : ''
  }

  function startResize(e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()

    const target = e.currentTarget as HTMLElement | null
    target?.setPointerCapture?.(e.pointerId)
    const startX = e.clientX
    const startWidth = sidebarWidth.value
    let lastClientX = e.clientX
    let rafId = 0

    const applyResize = () => {
      rafId = 0
      const newWidth = startWidth + (lastClientX - startX)
      sidebarWidth.value = Math.min(maxWidth, Math.max(minWidth, newWidth))
    }

    const onPointerMove = (event: PointerEvent) => {
      lastClientX = event.clientX
      if (!rafId) rafId = requestAnimationFrame(applyResize)
    }

    const onPointerUp = () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
        applyResize()
      }
      target?.releasePointerCapture?.(e.pointerId)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      setGlobalResizeState(false)
    }

    setGlobalResizeState(true)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
    window.addEventListener('pointercancel', onPointerUp, { once: true })
  }

  return { sidebarWidth, startResize }
}
