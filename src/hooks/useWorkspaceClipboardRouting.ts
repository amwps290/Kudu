import { useEffect, useRef } from 'react'
import { TabType } from '@/types/workspace'
import type { SqlEditorHandle } from './useTabManager'

/**
 * 剪贴板路由（对等 Vue 版 useWorkspaceClipboardRouting）。
 * window 捕获阶段拦 4 事件（keydown/copy/cut/paste）；仅当激活 query tab 且目标不在
 * Monaco 外的可编辑元素/选区时，转交给激活编辑器的 handleSystemClipboardAction。
 */

interface ClipboardRoutingOptions {
  getActiveTabType: () => TabType | undefined
  getActiveEditor: () => SqlEditorHandle | null
}

export function useWorkspaceClipboardRouting(options: ClipboardRoutingOptions) {
  const latestRef = useRef(options)
  latestRef.current = options

  useEffect(() => {
    function isNodeInsideMonaco(node: Node | null) {
      const element = node instanceof HTMLElement ? node : node?.parentElement || null
      return Boolean(element?.closest('.monaco-editor'))
    }

    function hasTextSelectionOutsideMonaco() {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false
      return !isNodeInsideMonaco(selection.anchorNode) || !isNodeInsideMonaco(selection.focusNode)
    }

    function isEditableTargetOutsideMonaco(target: EventTarget | null) {
      const element = target instanceof HTMLElement ? target : null
      if (!element) return false
      if (element.closest('.monaco-editor')) return false
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return true
      if (element.isContentEditable) return true
      return Boolean(element.closest('[contenteditable="true"], [contenteditable=""], input, textarea'))
    }

    function shouldRoute(target: EventTarget | null) {
      return latestRef.current.getActiveTabType() === TabType.Query
        && !isEditableTargetOutsideMonaco(target)
        && !hasTextSelectionOutsideMonaco()
    }

    function routeClipboardAction(action: 'copy' | 'cut' | 'paste') {
      window.setTimeout(() => latestRef.current.getActiveEditor()?.handleSystemClipboardAction(action), 0)
    }

    function handleKeydown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      if (latestRef.current.getActiveTabType() !== TabType.Query) return
      if (!shouldRoute(event.target)) return
      const key = event.key.toLowerCase()
      if (key !== 'c' && key !== 'x' && key !== 'v') return
      event.preventDefault()
      event.stopPropagation()
      routeClipboardAction(key === 'c' ? 'copy' : key === 'x' ? 'cut' : 'paste')
    }

    function handleClipboardEvent(event: ClipboardEvent) {
      const type = event.type
      if ((type !== 'copy' && type !== 'cut' && type !== 'paste') || !shouldRoute(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      routeClipboardAction(type)
    }

    window.addEventListener('keydown', handleKeydown, true)
    window.addEventListener('copy', handleClipboardEvent, true)
    window.addEventListener('cut', handleClipboardEvent, true)
    window.addEventListener('paste', handleClipboardEvent, true)

    return () => {
      window.removeEventListener('keydown', handleKeydown, true)
      window.removeEventListener('copy', handleClipboardEvent, true)
      window.removeEventListener('cut', handleClipboardEvent, true)
      window.removeEventListener('paste', handleClipboardEvent, true)
    }
  }, [])
}
