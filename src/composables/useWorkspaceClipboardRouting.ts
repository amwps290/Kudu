import { type Ref } from 'vue'
import { TabType } from '@/types/workspace'

interface ClipboardRoutingOptions {
  activeTabType: Ref<TabType | undefined>
  callActiveEditor: (method: string, ...args: unknown[]) => unknown
}

export function useWorkspaceClipboardRouting(options: ClipboardRoutingOptions) {
  function isNodeInsideMonaco(node: Node | null) {
    const element = node instanceof HTMLElement ? node : node?.parentElement || null
    return Boolean(element?.closest('.monaco-editor'))
  }

  function hasTextSelectionOutsideMonaco() {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false
    const anchorNode = selection.anchorNode
    const focusNode = selection.focusNode
    return !isNodeInsideMonaco(anchorNode) || !isNodeInsideMonaco(focusNode)
  }

  function isEditableTargetOutsideMonaco(target: EventTarget | null) {
    const element = target instanceof HTMLElement ? target : null
    if (!element) return false
    if (element.closest('.monaco-editor')) return false
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return true
    if (element.isContentEditable) return true
    return Boolean(element.closest('[contenteditable="true"], [contenteditable=""], input, textarea'))
  }

  function shouldRouteClipboardToActiveEditor(target: EventTarget | null) {
    return options.activeTabType.value === TabType.Query && !isEditableTargetOutsideMonaco(target) && !hasTextSelectionOutsideMonaco()
  }

  function routeClipboardAction(action: 'copy' | 'cut' | 'paste') {
    window.setTimeout(() => options.callActiveEditor('handleSystemClipboardAction', action), 0)
  }

  function handleGlobalClipboardKeydown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return
    if (options.activeTabType.value !== TabType.Query) return
    if (!shouldRouteClipboardToActiveEditor(event.target)) return

    const key = event.key.toLowerCase()
    if (key !== 'c' && key !== 'x' && key !== 'v') return

    event.preventDefault()
    event.stopPropagation()
    routeClipboardAction(key === 'c' ? 'copy' : key === 'x' ? 'cut' : 'paste')
  }

  function handleGlobalClipboardEvent(event: ClipboardEvent) {
    const type = event.type
    if ((type !== 'copy' && type !== 'cut' && type !== 'paste') || !shouldRouteClipboardToActiveEditor(event.target)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    routeClipboardAction(type)
  }

  function setupClipboardRouting() {
    window.addEventListener('keydown', handleGlobalClipboardKeydown, true)
    window.addEventListener('copy', handleGlobalClipboardEvent, true)
    window.addEventListener('cut', handleGlobalClipboardEvent, true)
    window.addEventListener('paste', handleGlobalClipboardEvent, true)
  }

  function cleanupClipboardRouting() {
    window.removeEventListener('keydown', handleGlobalClipboardKeydown, true)
    window.removeEventListener('copy', handleGlobalClipboardEvent, true)
    window.removeEventListener('cut', handleGlobalClipboardEvent, true)
    window.removeEventListener('paste', handleGlobalClipboardEvent, true)
  }

  return {
    setupClipboardRouting,
    cleanupClipboardRouting,
  }
}
