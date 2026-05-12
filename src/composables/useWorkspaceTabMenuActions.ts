interface TabMenuActionOptions {
  dataTabs: { value: Array<{ key: string; closable?: boolean; filePath?: string }> }
  currentContextTab: { key: string; closable: boolean }
  currentContextTabFilePath: { value: string }
  closeTabWithConfirm: (tabKey: string) => Promise<boolean>
  closeTabsWithConfirm: (keys: string[], fallbackActiveKey?: string) => Promise<boolean>
  hideContextMenu: () => void
  openFileLocation: (path: string) => void | Promise<void>
}

export function useWorkspaceTabMenuActions(options: TabMenuActionOptions) {
  async function handleTabMenuClick({ key }: { key: string | number }) {
    if (!options.currentContextTab.key) return
    const action = String(key)

    if (action === 'close-current' && options.currentContextTab.closable) {
      await options.closeTabWithConfirm(options.currentContextTab.key)
    } else if (action === 'close-left') {
      const anchorIndex = options.dataTabs.value.findIndex(tab => tab.key === options.currentContextTab.key)
      const keys = options.dataTabs.value
        .slice(0, anchorIndex)
        .filter(tab => tab.closable !== false)
        .map(tab => tab.key)
      await options.closeTabsWithConfirm(keys, options.currentContextTab.key)
    } else if (action === 'close-right') {
      const anchorIndex = options.dataTabs.value.findIndex(tab => tab.key === options.currentContextTab.key)
      const keys = options.dataTabs.value
        .slice(anchorIndex + 1)
        .filter(tab => tab.closable !== false)
        .map(tab => tab.key)
      await options.closeTabsWithConfirm(keys, options.currentContextTab.key)
    } else if (action === 'close-others') {
      const keys = options.dataTabs.value
        .filter(tab => tab.key !== options.currentContextTab.key && tab.closable !== false)
        .map(tab => tab.key)
      await options.closeTabsWithConfirm(keys, options.currentContextTab.key)
    } else if (action === 'close-saved') {
      const keys = options.dataTabs.value
        .filter(tab => tab.closable !== false && Boolean(tab.filePath))
        .map(tab => tab.key)
      await options.closeTabsWithConfirm(keys, options.currentContextTab.key)
    } else if (action === 'open-file-location') {
      const filePath = options.currentContextTabFilePath.value
      if (filePath) {
        await options.openFileLocation(filePath)
      }
    }

    options.hideContextMenu()
  }

  return {
    handleTabMenuClick,
  }
}
