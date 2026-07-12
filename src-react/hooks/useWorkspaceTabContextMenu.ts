import { useCallback, useState } from 'react'
import type { DataTab } from './useTabManager'
import { useContextMenu } from './useContextMenu'

/**
 * 工作区 tab 右键菜单状态（对等 Vue 版 useWorkspaceTabContextMenu）：
 * 通用右键菜单 + 当前目标 tab + 五个"可关闭性"派生值。
 */
export function useWorkspaceTabContextMenu(dataTabs: DataTab[]) {
  const { contextMenuVisible, contextMenuX, contextMenuY, showContextMenu, hideContextMenu } = useContextMenu()
  const [currentContextTab, setCurrentContextTab] = useState<{ key: string; closable: boolean }>({
    key: '',
    closable: false,
  })

  const handleTabContextMenu = useCallback(
    (event: { preventDefault(): void; clientX: number; clientY: number }, key: string, closable: boolean) => {
      setCurrentContextTab({ key, closable })
      showContextMenu(event)
    },
    [showContextMenu],
  )

  const currentContextTabIndex = dataTabs.findIndex((tab) => tab.key === currentContextTab.key)

  const hasClosableTabsOnLeft =
    currentContextTabIndex > 0 &&
    dataTabs.slice(0, currentContextTabIndex).some((tab) => tab.closable !== false)

  const hasClosableTabsOnRight =
    currentContextTabIndex >= 0 &&
    dataTabs.slice(currentContextTabIndex + 1).some((tab) => tab.closable !== false)

  const hasClosableOtherTabs = dataTabs.some(
    (tab) => tab.key !== currentContextTab.key && tab.closable !== false,
  )

  const hasClosableSavedTabs = dataTabs.some(
    (tab) => tab.closable !== false && Boolean(tab.filePath),
  )

  const currentContextTabFilePath = dataTabs.find((tab) => tab.key === currentContextTab.key)?.filePath || ''

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
