import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * 侧边栏拖拽调宽 hook（对等 Vue 版 useSidebarResize）：
 * pointer capture + rAF 节流 + 拖拽期间全局 col-resize 光标与禁选。
 * 宽度不持久化（与 Vue 版一致）。
 */
export function useSidebarResize(initialWidth = 280, minWidth = 200, maxWidth = 600) {
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth)
  const widthRef = useRef(initialWidth)

  const startResize = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()

    const target = e.currentTarget
    target.setPointerCapture?.(e.pointerId)
    const pointerId = e.pointerId
    const startX = e.clientX
    const startWidth = widthRef.current
    let lastClientX = e.clientX
    let rafId = 0

    const setGlobalResizeState = (active: boolean) => {
      document.body.style.cursor = active ? 'col-resize' : ''
      document.body.style.userSelect = active ? 'none' : ''
      document.body.style.webkitUserSelect = active ? 'none' : ''
    }

    const applyResize = () => {
      rafId = 0
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + (lastClientX - startX)))
      widthRef.current = newWidth
      setSidebarWidth(newWidth)
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
      target.releasePointerCapture?.(pointerId)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      setGlobalResizeState(false)
    }

    setGlobalResizeState(true)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
    window.addEventListener('pointercancel', onPointerUp, { once: true })
  }, [maxWidth, minWidth])

  return { sidebarWidth, startResize }
}
