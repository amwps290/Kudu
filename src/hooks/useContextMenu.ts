import { useCallback, useEffect, useState } from 'react'

interface ContextMenuTriggerEvent {
  preventDefault(): void
  clientX: number
  clientY: number
}

/**
 * 通用右键菜单状态 hook（对等 Vue 版 useContextMenu）：
 * 记录坐标 + document 点击外部关闭。
 */
export function useContextMenu() {
  const [contextMenuVisible, setContextMenuVisible] = useState(false)
  const [contextMenuX, setContextMenuX] = useState(0)
  const [contextMenuY, setContextMenuY] = useState(0)

  const showContextMenu = useCallback((e: ContextMenuTriggerEvent) => {
    e.preventDefault()
    setContextMenuX(e.clientX)
    setContextMenuY(e.clientY)
    setContextMenuVisible(true)
  }, [])

  const hideContextMenu = useCallback(() => {
    setContextMenuVisible(false)
  }, [])

  useEffect(() => {
    const handleClickOutside = () => setContextMenuVisible(false)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  return {
    contextMenuVisible,
    contextMenuX,
    contextMenuY,
    showContextMenu,
    hideContextMenu,
  }
}
