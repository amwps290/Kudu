import { computed, reactive, type Ref } from 'vue'
import type { DataTab } from '@/composables/useTabManager'
import { useContextMenu } from '@/composables/useContextMenu'

interface WorkspaceTabContextMenuOptions {
  dataTabs: Ref<DataTab[]>
}

export function useWorkspaceTabContextMenu(options: WorkspaceTabContextMenuOptions) {
  const { contextMenuVisible, contextMenuX, contextMenuY, showContextMenu, hideContextMenu } = useContextMenu()
  const currentContextTab = reactive({ key: '', closable: false })

  function handleTabContextMenu(event: MouseEvent, key: string, closable: boolean) {
    currentContextTab.key = key
    currentContextTab.closable = closable
    showContextMenu(event)
  }

  const currentContextTabIndex = computed(() =>
    options.dataTabs.value.findIndex(tab => tab.key === currentContextTab.key)
  )

  const hasClosableTabsOnLeft = computed(() =>
    currentContextTabIndex.value > 0 &&
    options.dataTabs.value.slice(0, currentContextTabIndex.value).some(tab => tab.closable !== false)
  )

  const hasClosableTabsOnRight = computed(() =>
    currentContextTabIndex.value >= 0 &&
    options.dataTabs.value.slice(currentContextTabIndex.value + 1).some(tab => tab.closable !== false)
  )

  const hasClosableOtherTabs = computed(() =>
    options.dataTabs.value.some(tab => tab.key !== currentContextTab.key && tab.closable !== false)
  )

  const hasClosableSavedTabs = computed(() =>
    options.dataTabs.value.some(tab => tab.closable !== false && Boolean(tab.filePath))
  )

  const currentContextTabFilePath = computed(() =>
    options.dataTabs.value.find(tab => tab.key === currentContextTab.key)?.filePath || ''
  )

  return {
    contextMenuVisible,
    contextMenuX,
    contextMenuY,
    currentContextTab,
    handleTabContextMenu,
    hideContextMenu,
    hasClosableTabsOnLeft,
    hasClosableTabsOnRight,
    hasClosableOtherTabs,
    hasClosableSavedTabs,
    currentContextTabFilePath,
  }
}
