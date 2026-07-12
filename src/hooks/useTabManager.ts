import { useCallback, useRef, useState } from 'react'
import type { TabState } from '@/types/workspace'
import { createIdleExecutionState, type SqlExecutionState } from '@/types/sqlExecution'

export interface DataTab extends TabState {
  closable?: boolean
}

/**
 * SqlEditor 命令式句柄（对等 Vue 版 SqlEditorExposed）。
 * Vue 版经 defineExpose + callActiveEditor('方法名') 字符串反射调用；
 * React 版改为类型化接口 + `getActiveEditor()` 直接调用（顺带修复清单第 6 项）。
 * Slice 10 起由 SqlEditor 通过 useImperativeHandle 实现。
 */
export interface SqlEditorHandle {
  executeQuery(): void
  explainQuery(): void
  stopExecution(): void
  focusEditor(): void
  handleSystemClipboardAction(action: 'copy' | 'cut' | 'paste'): void
  formatSql(): void
  clearEditor(): void
  openHistory(): void
  openSnippets(): void
  refreshAutocomplete(): void
  handleDatabaseChange(db: string): void
  setSelectedDatabase(db: string): void
  isExecuting(): boolean
}

interface TabsState {
  tabs: DataTab[]
  activeKey: string
}

/** 批量移除 + 激活键回退（纯函数，逻辑照抄 Vue 版 applyTabRemoval） */
function applyTabRemovalPure(prev: TabsState, keysToRemove: Set<string>, fallbackActiveKey?: string): TabsState {
  if (keysToRemove.size === 0) return prev

  const remaining = prev.tabs.filter((tab) => !keysToRemove.has(tab.key))
  if (remaining.length === 0) {
    return { tabs: remaining, activeKey: '' }
  }

  if (!keysToRemove.has(prev.activeKey) && remaining.some((tab) => tab.key === prev.activeKey)) {
    return { tabs: remaining, activeKey: prev.activeKey }
  }

  if (fallbackActiveKey && remaining.some((tab) => tab.key === fallbackActiveKey)) {
    return { tabs: remaining, activeKey: fallbackActiveKey }
  }

  return { tabs: remaining, activeKey: remaining[remaining.length - 1].key }
}

/**
 * 工作区 tab 管理 hook（对等 Vue 版 useTabManager，在 HomeView 实例化一次）。
 * 范式差异：Vue 版大量 in-place 突变（tab.dirty = true 等）+ deep watch；
 * 这里收敛为 `updateTab(key, patch)` 单一不可变原语，tabs 数组每次整体替换。
 */
export function useTabManager() {
  const [state, setState] = useState<TabsState>({ tabs: [], activeKey: '' })
  const [sqlExecutionStates, setSqlExecutionStates] = useState<Record<string, SqlExecutionState>>({})
  const sqlEditorRefs = useRef(new Map<string, SqlEditorHandle>())

  // 稳定回调内读取最新状态用
  const stateRef = useRef(state)
  stateRef.current = state

  const dataTabs = state.tabs
  const mainTabKey = state.activeKey

  const setMainTabKey = useCallback((key: string) => {
    setState((prev) => (prev.activeKey === key ? prev : { ...prev, activeKey: key }))
  }, [])

  /** 不可变更新单个 tab 的原语——所有"改 tab 字段"必须走这里 */
  const updateTab = useCallback((key: string, patch: Partial<DataTab>) => {
    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((tab) => (tab.key === key ? { ...tab, ...patch } : tab)),
    }))
  }, [])

  const addTab = useCallback((tab: DataTab) => {
    setState((prev) => ({ tabs: [...prev.tabs, tab], activeKey: tab.key }))
  }, [])

  /** 会话恢复：整体替换 tabs 与激活 key（对等 Vue 版直接写 dataTabs/mainTabKey 两个 ref） */
  const replaceAllTabs = useCallback((tabs: DataTab[], activeKey: string) => {
    setState({ tabs, activeKey })
  }, [])

  const closeTab = useCallback((key: string) => {
    setState((prev) => {
      const index = prev.tabs.findIndex((t) => t.key === key)
      if (index < 0) return prev
      const tabs = prev.tabs.filter((t) => t.key !== key)
      let activeKey = prev.activeKey
      if (prev.activeKey === key && tabs.length > 0) {
        activeKey = tabs[Math.min(index, tabs.length - 1)].key
      } else if (tabs.length === 0) {
        activeKey = ''
      }
      return { tabs, activeKey }
    })
  }, [])

  const closeTabsLeftOf = useCallback((key: string) => {
    setState((prev) => {
      const anchorIndex = prev.tabs.findIndex((tab) => tab.key === key)
      if (anchorIndex <= 0) return prev
      const keysToRemove = new Set(
        prev.tabs.slice(0, anchorIndex).filter((tab) => tab.closable !== false).map((tab) => tab.key),
      )
      return applyTabRemovalPure(prev, keysToRemove, key)
    })
  }, [])

  const closeTabsRightOf = useCallback((key: string) => {
    setState((prev) => {
      const anchorIndex = prev.tabs.findIndex((tab) => tab.key === key)
      if (anchorIndex < 0 || anchorIndex >= prev.tabs.length - 1) return prev
      const keysToRemove = new Set(
        prev.tabs.slice(anchorIndex + 1).filter((tab) => tab.closable !== false).map((tab) => tab.key),
      )
      return applyTabRemovalPure(prev, keysToRemove, key)
    })
  }, [])

  const closeOtherTabs = useCallback((key: string) => {
    setState((prev) => {
      const keysToRemove = new Set(
        prev.tabs.filter((tab) => tab.key !== key && tab.closable !== false).map((tab) => tab.key),
      )
      return applyTabRemovalPure(prev, keysToRemove, key)
    })
  }, [])

  const closeSavedTabs = useCallback((fallbackActiveKey?: string) => {
    setState((prev) => {
      const keysToRemove = new Set(
        prev.tabs.filter((tab) => tab.closable !== false && Boolean(tab.filePath)).map((tab) => tab.key),
      )
      return applyTabRemovalPure(prev, keysToRemove, fallbackActiveKey)
    })
  }, [])

  const removeTabs = useCallback((keys: Iterable<string>, fallbackActiveKey?: string) => {
    setState((prev) => applyTabRemovalPure(prev, new Set(keys), fallbackActiveKey))
  }, [])

  const findTabByKey = useCallback(
    (key: string): DataTab | undefined => stateRef.current.tabs.find((t) => t.key === key),
    [],
  )

  const tabExists = useCallback(
    (key: string): boolean => stateRef.current.tabs.some((t) => t.key === key),
    [],
  )

  const handleContentChange = useCallback((key: string, val: string) => {
    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((tab) => {
        if (tab.key !== key) return tab
        return tab.type === 'query'
          ? { ...tab, content: val, dirty: true }
          : { ...tab, content: val }
      }),
    }))
  }, [])

  const handleFileSaved = useCallback((key: string, path: string, title: string) => {
    updateTab(key, { filePath: path, title, dirty: false, isUntitled: false })
  }, [updateTab])

  // ===== SQL 编辑器句柄注册表与执行状态 =====

  const setSqlEditorRef = useCallback((key: string, handle: SqlEditorHandle | null) => {
    if (handle) {
      sqlEditorRefs.current.set(key, handle)
      setSqlExecutionStates((prev) => (prev[key] ? prev : { ...prev, [key]: createIdleExecutionState() }))
    } else {
      sqlEditorRefs.current.delete(key)
      setSqlExecutionStates((prev) => {
        if (!(key in prev)) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }, [])

  const updateSqlExecutionState = useCallback((key: string, execState: SqlExecutionState) => {
    setSqlExecutionStates((prev) => ({ ...prev, [key]: { ...execState } }))
  }, [])

  /** 类型化替代 Vue 版 callActiveEditor 字符串反射 */
  const getActiveEditor = useCallback(
    (): SqlEditorHandle | null => sqlEditorRefs.current.get(stateRef.current.activeKey) ?? null,
    [],
  )

  // ===== 派生值（每次渲染直接计算，对等 Vue computed）=====

  const activeTab = dataTabs.find((t) => t.key === mainTabKey)
  const activeQueryTab = activeTab?.type === 'query' ? activeTab : null
  const activeTabType = activeTab?.type
  const activeTabDatabase = activeTab?.database || ''
  const setActiveTabDatabase = useCallback((val: string) => {
    const key = stateRef.current.activeKey
    if (key) updateTab(key, { database: val })
  }, [updateTab])

  const activeEditorExecutionState: SqlExecutionState | null = sqlExecutionStates[mainTabKey] || null
  const activeEditorExecuting = activeEditorExecutionState?.status === 'running'

  return {
    dataTabs,
    mainTabKey,
    setMainTabKey,
    activeTab,
    activeQueryTab,
    activeTabType,
    activeTabDatabase,
    setActiveTabDatabase,
    activeEditorExecuting,
    activeEditorExecutionState,
    sqlExecutionStates,
    updateTab,
    addTab,
    replaceAllTabs,
    closeTab,
    closeTabsLeftOf,
    closeTabsRightOf,
    closeOtherTabs,
    closeSavedTabs,
    removeTabs,
    findTabByKey,
    tabExists,
    handleContentChange,
    handleFileSaved,
    setSqlEditorRef,
    updateSqlExecutionState,
    getActiveEditor,
  }
}

export type TabManager = ReturnType<typeof useTabManager>
