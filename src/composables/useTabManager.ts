import { ref, computed, reactive } from 'vue'
import type { TabState } from '@/types/workspace'
import { createIdleExecutionState, type SqlExecutionState } from '@/types/sqlExecution'

export interface DataTab extends TabState {
  closable?: boolean
}

/** SqlEditor 组件暴露的方法接口 */
export interface SqlEditorExposed {
  executeQuery: () => void
  explainQuery: () => void
  stopExecution: () => void
  focusEditor: () => void
  handleSystemClipboardAction: (action: 'copy' | 'cut' | 'paste') => void
  formatSql: () => void
  clearEditor: () => void
  openHistory: () => void
  openSnippets: () => void
  refreshAutocomplete: () => void
  handleDatabaseChange: (db: string) => void
  setSelectedDatabase: (db: string) => void
  executing: boolean
  executionState: SqlExecutionState
  [key: string]: unknown
}

export function useTabManager() {
  const dataTabs = ref<DataTab[]>([])
  const mainTabKey = ref('')
  const sqlEditorRefs = reactive<Record<string, SqlEditorExposed>>({})
  const sqlExecutionStates = reactive<Record<string, SqlExecutionState>>({})

  const activeTabType = computed(() =>
    dataTabs.value.find(t => t.key === mainTabKey.value)?.type
  )

  const activeTabDatabase = computed({
    get: () => dataTabs.value.find(t => t.key === mainTabKey.value)?.database || '',
    set: (val: string) => {
      const tab = dataTabs.value.find(t => t.key === mainTabKey.value)
      if (tab) tab.database = val
    }
  })

  const activeTab = computed(() =>
    dataTabs.value.find(t => t.key === mainTabKey.value)
  )

  const activeEditorExecuting = computed(() =>
    sqlExecutionStates[mainTabKey.value]?.status === 'running'
  )

  const activeEditorExecutionState = computed<SqlExecutionState | null>(() =>
    sqlExecutionStates[mainTabKey.value] || null
  )

  const activeQueryTab = computed(() =>
    activeTab.value?.type === 'query' ? activeTab.value : null
  )

  function setSqlEditorRef(el: unknown, key: string) {
    if (el) {
      sqlEditorRefs[key] = el as SqlEditorExposed
      if (!sqlExecutionStates[key]) {
        sqlExecutionStates[key] = createIdleExecutionState()
      }
    } else {
      delete sqlEditorRefs[key]
      delete sqlExecutionStates[key]
    }
  }

  function updateSqlExecutionState(key: string, state: SqlExecutionState) {
    sqlExecutionStates[key] = { ...state }
  }

  function callActiveEditor(method: string, ...args: unknown[]) {
    const editor = sqlEditorRefs[mainTabKey.value]
    if (!editor) {
      console.warn('[SQL][Toolbar] active editor not found', {
        tabKey: mainTabKey.value,
        method,
        args,
      })
      return undefined
    }

    if (typeof editor[method] !== 'function') {
      console.warn('[SQL][Toolbar] editor method not found', {
        tabKey: mainTabKey.value,
        method,
        args,
      })
      return undefined
    }

    console.info('[SQL][Toolbar] invoking editor method', {
      tabKey: mainTabKey.value,
      method,
      args,
    })
    return (editor[method] as (...a: unknown[]) => unknown)(...args)
  }

  function closeTab(key: string) {
    const index = dataTabs.value.findIndex(t => t.key === key)
    if (index >= 0) {
      dataTabs.value.splice(index, 1)
      if (mainTabKey.value === key && dataTabs.value.length > 0) {
        mainTabKey.value = dataTabs.value[Math.min(index, dataTabs.value.length - 1)].key
      } else if (dataTabs.value.length === 0) {
        mainTabKey.value = ''
      }
    }
  }

  function applyTabRemoval(keysToRemove: Set<string>, fallbackActiveKey?: string) {
    if (keysToRemove.size === 0) return

    const remainingTabs = dataTabs.value.filter(tab => !keysToRemove.has(tab.key))
    dataTabs.value = remainingTabs

    if (remainingTabs.length === 0) {
      mainTabKey.value = ''
      return
    }

    if (!keysToRemove.has(mainTabKey.value) && remainingTabs.some(tab => tab.key === mainTabKey.value)) {
      return
    }

    if (fallbackActiveKey && remainingTabs.some(tab => tab.key === fallbackActiveKey)) {
      mainTabKey.value = fallbackActiveKey
      return
    }

    mainTabKey.value = remainingTabs[Math.max(remainingTabs.length - 1, 0)].key
  }

  function closeTabsLeftOf(key: string) {
    const anchorIndex = dataTabs.value.findIndex(tab => tab.key === key)
    if (anchorIndex <= 0) return

    const keysToRemove = new Set(
      dataTabs.value
        .slice(0, anchorIndex)
        .filter(tab => tab.closable !== false)
        .map(tab => tab.key)
    )

    applyTabRemoval(keysToRemove, key)
  }

  function closeTabsRightOf(key: string) {
    const anchorIndex = dataTabs.value.findIndex(tab => tab.key === key)
    if (anchorIndex < 0 || anchorIndex >= dataTabs.value.length - 1) return

    const keysToRemove = new Set(
      dataTabs.value
        .slice(anchorIndex + 1)
        .filter(tab => tab.closable !== false)
        .map(tab => tab.key)
    )

    applyTabRemoval(keysToRemove, key)
  }

  function closeOtherTabs(key: string) {
    const keysToRemove = new Set(
      dataTabs.value
        .filter(tab => tab.key !== key && tab.closable !== false)
        .map(tab => tab.key)
    )

    applyTabRemoval(keysToRemove, key)
  }

  function closeSavedTabs(fallbackActiveKey?: string) {
    const keysToRemove = new Set(
      dataTabs.value
        .filter(tab => tab.closable !== false && Boolean(tab.filePath))
        .map(tab => tab.key)
    )

    applyTabRemoval(keysToRemove, fallbackActiveKey)
  }

  function findTabByKey(key: string): DataTab | undefined {
    return dataTabs.value.find(t => t.key === key)
  }

  function tabExists(key: string): boolean {
    return dataTabs.value.some(t => t.key === key)
  }

  function addTab(tab: DataTab) {
    dataTabs.value.push(tab)
    mainTabKey.value = tab.key
  }

  function handleContentChange(key: string, val: string) {
    const tab = dataTabs.value.find(t => t.key === key)
    if (!tab) return
    tab.content = val
    if (tab.type === 'query') {
      tab.dirty = true
    }
  }

  function handleFileSaved(key: string, path: string, title: string) {
    const tab = dataTabs.value.find(t => t.key === key)
    if (tab) {
      tab.filePath = path
      tab.title = title
      tab.dirty = false
      tab.isUntitled = false
    }
  }

  function removeTabs(keys: Iterable<string>, fallbackActiveKey?: string) {
    applyTabRemoval(new Set(keys), fallbackActiveKey)
  }

  return {
    dataTabs,
    mainTabKey,
    sqlEditorRefs,
    sqlExecutionStates,
    activeTab,
    activeQueryTab,
    activeTabType,
    activeTabDatabase,
    activeEditorExecuting,
    activeEditorExecutionState,
    setSqlEditorRef,
    updateSqlExecutionState,
    callActiveEditor,
    closeTab,
    closeTabsLeftOf,
    closeTabsRightOf,
    closeOtherTabs,
    closeSavedTabs,
    removeTabs,
    findTabByKey,
    tabExists,
    addTab,
    handleContentChange,
    handleFileSaved,
  }
}
