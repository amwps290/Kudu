import { forwardRef, lazy, Suspense, useEffect, useImperativeHandle, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Drawer, Dropdown, Empty, Input, List, Menu, Space, Tabs, Tag } from 'antd'
import type { MenuProps } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, CloseOutlined, CopyOutlined, ExportOutlined, LoadingOutlined, StopOutlined } from '@ant-design/icons'
import { save } from '@tauri-apps/plugin-dialog'
import { message } from '../../ui/antd'
import { getSqlAutocompleteManager } from '@/services/sqlAutocomplete'
import { exportApi, metadataApi, queryApi } from '@/api'
import type { DatabaseInfo, QueryResult } from '@/types/database'
import type { SqlExecutionState } from '@/types/sqlExecution'
import { getStorageItem, setStorageItem } from '@/utils/storageService'
import { readClipboardText, writeClipboardText } from '@/utils/clipboard'
import { getErrorMessage } from '@/utils/errorHandler'
import { useConnectionStore } from '../../stores/connectionStore'
import { useRightPanelStore } from '../../stores/rightPanelStore'
import { useMonacoEditor } from '../../hooks/useMonacoEditor'
import { useSqlExecution, type ResultPageState } from '../../hooks/useSqlExecution'
import { useSqlHistory } from '../../hooks/useSqlHistory'
import type { SqlEditorHandle } from '../../hooks/useTabManager'
import { findCurrentStatementInText } from '../../utils/sqlStatement'
import type { MonacoModule } from '@/utils/monacoLoader'
import SqlToolbar, { type SqlToolbarAction } from './SqlToolbar'
import SaveQueryDialog from './SaveQueryDialog'
import SqlSnippetsManager from './SqlSnippetsManager'
import styles from './SqlEditor.module.css'

const ResultGrid = lazy(() => import('../grid/ResultGrid'))

/**
 * SQL 编辑器（Slice 11 状态：编辑器区 + 补全 + 执行链 + 结果 dock）。
 * - 执行链 useSqlExecution：危险确认/只读拦截/取消/isStale 全量接入；
 * - 结果 dock：错误 tab（持久化）/进度 tab（耗时 ticker + 停止）/结果 tab（极简 HTML 表格占位，
 *   Slice 12 换 AG Grid 并补齐复制/导出/右键菜单/触底加载/拖拽条）；
 * - 历史抽屉 / 保存查询 / SQL 片段（三个 localStorage key 原样）。
 * - onDbMessage 暂为 no-op（NOTICE 等消息面板随 Slice 13 右侧面板接入）。
 *
 * 合约红线（迁移计划 5-3）：会话 id 规则逐字保留——
 * `${baseConnId}:tab_${internalSessionId 非字母数字替换为 _}`；
 * 执行/取消/format/set search_path 走会话 id，元数据与补全走基础 id。
 */

type AutocompleteManager = Awaited<ReturnType<typeof getSqlAutocompleteManager>>

const RESULT_PANEL_HEIGHT_KEY = 'sql_result_panel_height'
const RESULT_PANEL_VISIBLE_KEY = 'sql_result_panel_visible'
const RESULT_PANEL_MIN_HEIGHT = 180
const RESULT_PANEL_COLLAPSED_HEIGHT = 0

interface ResultClipboardSelection {
  row: Record<string, unknown>
  rowIndex: number
  field: string
  title: string
}

interface ErrorTabInfo {
  key: string
  status: 'failed' | 'cancelled' | 'partial_success'
  summary: string
  detail: string
  elapsedMs: number
  createdAt: number
}

interface OrderedTab {
  kind: 'error' | 'result' | 'progress'
  key: string
  errorIndex?: number
  resultIndex?: number
  createdAt: number
}

function formatElapsed(ms: number): string {
  if (ms <= 0) return '0 ms'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

interface SqlEditorProps {
  connectionId?: string
  initialDatabase?: string
  initialValue?: string
  filePath?: string
  tabId?: string
  autoExecuteNonce?: string
  /** 对等 Vue 版 onActivated：tab 激活时聚焦并刷新上下文 */
  active?: boolean
  onContentChange?: (value: string) => void
  onRequestSave?: () => void
  onRequestSaveAs?: () => void
  onDatabaseChange?: (database: string) => void
  onExecutionStateChange?: (state: SqlExecutionState) => void
}

const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(function SqlEditor(props, ref) {
  const { t } = useTranslation()

  const connections = useConnectionStore((s) => s.connections)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const connectionStatuses = useConnectionStore((s) => s.connectionStatuses)

  // ── 会话身份（合约红线，逐字保留 Vue 版规则）──
  const internalSessionIdRef = useRef(
    props.tabId || props.filePath || `editor-${Math.random().toString(36).substring(2, 9)}`,
  )
  const baseConnectionId = props.connectionId || activeConnectionId || ''
  const sessionConnectionId = baseConnectionId
    ? `${baseConnectionId}:tab_${internalSessionIdRef.current.replace(/[^a-zA-Z0-9]/g, '_')}`
    : ''

  const currentConnection = connections.find((c) => c.id === baseConnectionId) || null
  const dbType = currentConnection?.db_type
  const supportsSearchPath = dbType === 'postgresql' || dbType === 'opengauss' || dbType === 'gaussdb'

  // ── 数据库上下文 ──
  const [availableDatabases, setAvailableDatabases] = useState<DatabaseInfo[]>([])
  const [selectedDatabase, setSelectedDatabaseState] = useState(props.initialDatabase || '')
  const [searchPath, setSearchPathState] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const autocompleteRef = useRef<AutocompleteManager | null>(null)
  const decorationRef = useRef<any>(null)

  // ── 结果管理 ──
  const [queryResults, setQueryResults] = useState<QueryResult[]>([])
  const queryResultsRef = useRef<QueryResult[]>([])
  const [resultTabKey, setResultTabKey] = useState('result-0')
  const resultTabKeyRef = useRef('result-0')
  const [resultPanelVisible, setResultPanelVisible] = useState(() => getStorageItem(RESULT_PANEL_VISIBLE_KEY, false))
  const [resultPanelHeight, setResultPanelHeight] = useState(() => getStorageItem(RESULT_PANEL_HEIGHT_KEY, 260))
  const resultPanelHeightRef = useRef(resultPanelHeight)
  resultPanelHeightRef.current = resultPanelHeight
  const [errorTabs, setErrorTabs] = useState<ErrorTabInfo[]>([])
  const errorTabsRef = useRef<ErrorTabInfo[]>([])
  const errorTabCounterRef = useRef(0)
  const [resultTabCreatedAt, setResultTabCreatedAt] = useState<Record<number, number>>({})
  const resultTabCreatedAtRef = useRef<Record<number, number>>({})
  const [queryResultStates, setQueryResultStates] = useState<Record<number, ResultPageState>>({})
  const queryResultStatesRef = useRef<Record<number, ResultPageState>>({})
  const [resultClipboardSelections, setResultClipboardSelections] = useState<Record<number, ResultClipboardSelection>>({})
  const resultClipboardSelectionsRef = useRef<Record<number, ResultClipboardSelection>>({})

  // 结果 tab 右键菜单
  const [resultContextMenuVisible, setResultContextMenuVisible] = useState(false)
  const [resultContextMenuX, setResultContextMenuX] = useState(0)
  const [resultContextMenuY, setResultContextMenuY] = useState(0)
  const [resultContextIndex, setResultContextIndex] = useState(-1)

  // 分隔条拖拽
  const rootRef = useRef<HTMLDivElement>(null)
  const [isSplitResizing, setIsSplitResizing] = useState(false)
  const isSplitResizingRef = useRef(false)
  const editorAutoLayoutSuspendCountRef = useRef(0)
  const editorLayoutResumeRafRef = useRef(0)

  function applyQueryResultStates(next: Record<number, ResultPageState>) {
    queryResultStatesRef.current = next
    setQueryResultStates(next)
  }

  function applyResultClipboardSelections(next: Record<number, ResultClipboardSelection>) {
    resultClipboardSelectionsRef.current = next
    setResultClipboardSelections(next)
  }

  function applyResultTabKey(key: string) {
    resultTabKeyRef.current = key
    setResultTabKey(key)
  }

  // 事件/计时回调统一经 latestRef 读最新值（对等 Vue live ref/props）
  const latest = {
    onContentChange: props.onContentChange,
    onRequestSave: props.onRequestSave,
    onDatabaseChange: props.onDatabaseChange,
    initialDatabase: props.initialDatabase,
    baseConnectionId,
    sessionConnectionId,
    selectedDatabase,
    supportsSearchPath,
    availableDatabasesCount: availableDatabases.length,
  }
  const latestRef = useRef(latest)
  latestRef.current = latest

  /** 立即更新 latestRef 再 setState——Vue 版写 ref 后同一 tick 内即可读到新值 */
  function applySelectedDatabase(db: string) {
    latestRef.current.selectedDatabase = db
    setSelectedDatabaseState(db)
  }

  function computeDatabaseLabel(db: string): string {
    const conn = useConnectionStore.getState().connections.find(
      (c) => c.id === latestRef.current.baseConnectionId,
    )
    if (db) return db
    if (latestRef.current.initialDatabase) return latestRef.current.initialDatabase
    if (conn?.database) return conn.database
    if (conn?.db_type === 'sqlite') return 'main'
    return t('editor.default_database')
  }

  // ── 结果面板显隐 ──
  function revealResultPanel() { setResultPanelVisible(true) }
  function toggleResultPanel() { setResultPanelVisible((v) => !v) }
  useEffect(() => {
    setStorageItem(RESULT_PANEL_VISIBLE_KEY, resultPanelVisible)
  }, [resultPanelVisible])

  // ── 错误 tabs（持久化，不随新执行关闭）──
  function addErrorTab(status: 'failed' | 'cancelled' | 'partial_success', summary: string, detail: string, elapsedMs: number) {
    const key = `error-${++errorTabCounterRef.current}`
    errorTabsRef.current = [...errorTabsRef.current, { key, status, summary, detail, elapsedMs, createdAt: Date.now() }]
    setErrorTabs(errorTabsRef.current)
    applyResultTabKey(key)
    revealResultPanel()
  }

  function closeErrorTab(index: number) {
    if (index < 0 || index >= errorTabsRef.current.length) return
    const removedKey = errorTabsRef.current[index].key
    errorTabsRef.current = errorTabsRef.current.filter((_, i) => i !== index)
    setErrorTabs(errorTabsRef.current)
    if (resultTabKeyRef.current === removedKey) {
      if (execution.executingRef.current) applyResultTabKey('progress')
      else if (queryResultsRef.current.length > 0) applyResultTabKey('result-' + Math.max(0, queryResultsRef.current.length - 1))
      else if (errorTabsRef.current.length > 0) applyResultTabKey(errorTabsRef.current[errorTabsRef.current.length - 1].key)
      else applyResultTabKey('result-0')
    }
  }

  // ── 结果集追加与关闭（逻辑照抄 Vue 版）──
  function appendQueryResults(results: QueryResult[], states: ResultPageState[]) {
    const startIndex = queryResultsRef.current.length
    queryResultsRef.current = [...queryResultsRef.current, ...results]
    setQueryResults(queryResultsRef.current)
    const nextCreatedAt = { ...resultTabCreatedAtRef.current }
    const nextStates = { ...queryResultStatesRef.current }
    states.forEach((state, offset) => {
      nextStates[startIndex + offset] = { ...state }
      nextCreatedAt[startIndex + offset] = Date.now()
    })
    applyQueryResultStates(nextStates)
    resultTabCreatedAtRef.current = nextCreatedAt
    setResultTabCreatedAt(nextCreatedAt)
    return startIndex
  }

  function getActiveResultIndex() {
    const m = /^result-(\d+)$/.exec(resultTabKeyRef.current)
    return m ? Number(m[1]) : -1
  }

  function replaceResultTabs(keptSourceIndices: number[]) {
    const nextResults = keptSourceIndices.map((i) => queryResultsRef.current[i])
    const keptStates = keptSourceIndices.map((i) => queryResultStatesRef.current[i])
    const keptSelections = keptSourceIndices.map((i) => resultClipboardSelectionsRef.current[i])
    const nextCreatedAt: Record<number, number> = {}
    keptSourceIndices.forEach((oldIdx, newIdx) => {
      nextCreatedAt[newIdx] = resultTabCreatedAtRef.current[oldIdx] || 0
    })
    const prevActive = getActiveResultIndex()

    queryResultsRef.current = nextResults
    setQueryResults(nextResults)
    resultTabCreatedAtRef.current = nextCreatedAt
    setResultTabCreatedAt(nextCreatedAt)
    const nextStates: Record<number, ResultPageState> = {}
    keptStates.forEach((s, i) => { if (s) nextStates[i] = { ...s } })
    applyQueryResultStates(nextStates)
    const nextSelections: Record<number, ResultClipboardSelection> = {}
    keptSelections.forEach((s, i) => { if (s) nextSelections[i] = s })
    applyResultClipboardSelections(nextSelections)

    const executingNow = execution.executingRef.current
    if (prevActive < 0) {
      if (nextResults.length === 0) {
        applyResultTabKey(executingNow ? 'progress' : (errorTabsRef.current.length > 0 ? errorTabsRef.current[errorTabsRef.current.length - 1].key : 'result-0'))
        return
      }
      applyResultTabKey('result-0')
      return
    }
    const preserved = keptSourceIndices.indexOf(prevActive)
    if (preserved >= 0) { applyResultTabKey(`result-${preserved}`); return }
    if (nextResults.length === 0) {
      applyResultTabKey(executingNow ? 'progress' : (errorTabsRef.current.length > 0 ? errorTabsRef.current[errorTabsRef.current.length - 1].key : 'result-0'))
      return
    }
    const nextIdx = keptSourceIndices.findIndex((i) => i > prevActive)
    applyResultTabKey(`result-${nextIdx >= 0 ? nextIdx : nextResults.length - 1}`)
  }

  function closeResultAt(index: number) {
    if (index < 0 || index >= queryResultsRef.current.length) return
    replaceResultTabs(queryResultsRef.current.map((_, i) => i).filter((i) => i !== index))
  }

  function closeResultTabsLeftOf(index: number) {
    if (index <= 0) return
    replaceResultTabs(queryResultsRef.current.map((_, i) => i).filter((i) => i >= index))
  }

  function closeResultTabsRightOf(index: number) {
    if (index < 0 || index >= queryResultsRef.current.length - 1) return
    replaceResultTabs(queryResultsRef.current.map((_, i) => i).filter((i) => i <= index))
  }

  // ── 执行链（11 回调注入结构照抄）──
  const execution = useSqlExecution({
    getSql: () => editorRef.current?.getValue() || '',
    getSelectionSql: () => {
      const sel = editorRef.current?.getSelection()
      const model = editorRef.current?.getModel()
      if (sel && model && !sel.isEmpty()) return model.getValueInRange(sel).trim() || null
      return null
    },
    getCurrentStatementSql: () => {
      const model = editorRef.current?.getModel()
      const pos = editorRef.current?.getPosition()
      if (!model || !pos) return null
      const seg = findCurrentStatementInText(model.getValue(), model.getOffsetAt(pos))
      return seg?.sql || null
    },
    isReadOnly: () => {
      const conn = useConnectionStore.getState().connections.find(
        (c) => c.id === latestRef.current.baseConnectionId,
      )
      return Boolean(conn?.read_only)
    },
    onAppendResults: (results, states) => appendQueryResults(results, states),
    onSwitchToTab: (tabKey) => applyResultTabKey(tabKey),
    onAddErrorTab: addErrorTab,
    onRevealPanel: revealResultPanel,
    // NOTICE/WARNING 等数据库消息推入右侧 output 面板（Slice 13）
    onDbMessage: (severity, text) => {
      const conn = useConnectionStore.getState().connections.find(
        (c) => c.id === latestRef.current.baseConnectionId,
      )
      useRightPanelStore.getState().pushDbMessage({
        severity,
        text,
        time: Date.now(),
        connectionName: conn?.name,
        database: latestRef.current.selectedDatabase || conn?.database,
      })
    },
    onSaveHistory: (sql) => history.add(sql, latestRef.current.selectedDatabase),
    t: (key, options) => t(key, options ?? {}) as string,
  })

  async function executeQueryAction() {
    const connId = latestRef.current.sessionConnectionId
    if (!connId) return
    await execution.executeQuery(connId, latestRef.current.selectedDatabase || null)
  }
  async function explainQueryAction() {
    const connId = latestRef.current.sessionConnectionId
    if (!connId) return
    await execution.explainQuery(connId, latestRef.current.selectedDatabase || null)
  }
  function stopExec() { void execution.stopExecution(latestRef.current.sessionConnectionId) }

  // ── 滚动分页（触底加载，前端拼 LIMIT/OFFSET——现状保留，已知业务问题 1 不修）──
  function handleResultGridReachBottom(index: number) {
    const state = queryResultStatesRef.current[index]
    if (!execution.executingRef.current && state?.hasMore && !state.loading) {
      void loadNextPage(index)
    }
  }

  async function loadNextPage(index: number) {
    const state = queryResultStatesRef.current[index]
    if (!state || state.loading || !state.hasMore) return
    const nextPagination = { ...state.pagination, current: state.pagination.current + 1 }
    applyQueryResultStates({
      ...queryResultStatesRef.current,
      [index]: { ...state, loading: true, pagination: nextPagination },
    })
    const patchState = (patch: Partial<ResultPageState>) => {
      const current = queryResultStatesRef.current[index]
      if (!current) return
      applyQueryResultStates({ ...queryResultStatesRef.current, [index]: { ...current, ...patch } })
    }

    const offset = (nextPagination.current - 1) * nextPagination.pageSize
    let baseSql = state.sql.trim()
    if (baseSql.endsWith(';')) baseSql = baseSql.slice(0, -1).trim()
    const cleanSql = baseSql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(--|#).*$/gm, '').trim()
    const isSelect = cleanSql.toUpperCase().startsWith('SELECT')
    const hasLimit = /\bLIMIT\b/i.test(cleanSql)
    if (isSelect && !hasLimit && !cleanSql.includes(';')) {
      const pagedSql = `${baseSql} LIMIT ${nextPagination.pageSize} OFFSET ${offset};`
      try {
        const results = await queryApi.executeQuery(
          latestRef.current.sessionConnectionId,
          pagedSql,
          latestRef.current.selectedDatabase || null,
          undefined,
          { allowReconnectRetry: true },
        )
        if (results.length > 0) {
          const r = results[0]
          patchState({ hasMore: r.rows.length === nextPagination.pageSize })
          const prev = queryResultsRef.current[index]
          const merged = { ...prev, rows: [...prev.rows, ...r.rows] }
          queryResultsRef.current = queryResultsRef.current.map((item, i) => (i === index ? merged : item))
          setQueryResults(queryResultsRef.current)
        } else {
          patchState({ hasMore: false })
        }
      } catch (e: unknown) {
        message.error(getErrorMessage(e))
        patchState({ hasMore: false })
      } finally {
        patchState({ loading: false })
      }
    } else {
      patchState({ hasMore: false, loading: false })
    }
  }

  // ── 结果上下文菜单 & 剪贴板 ──
  function hideResultContextMenu() {
    setResultContextMenuVisible(false)
    setResultContextIndex(-1)
  }

  function handleResultTabContextMenu(event: React.MouseEvent, index: number) {
    setResultContextIndex(index)
    setResultContextMenuX(event.clientX)
    setResultContextMenuY(event.clientY)
    setResultContextMenuVisible(true)
  }

  const hasResultTabsOnLeft = resultContextIndex > 0
  const hasResultTabsOnRight = resultContextIndex >= 0 && resultContextIndex < queryResults.length - 1

  const handleResultMenuClick: MenuProps['onClick'] = ({ key }) => {
    const action = String(key)
    const idx = resultContextIndex
    if (action === 'close-current') closeResultAt(idx)
    else if (action === 'close-left') closeResultTabsLeftOf(idx)
    else if (action === 'close-right') closeResultTabsRightOf(idx)
    hideResultContextMenu()
  }

  function handleResultCellClick(index: number, payload: { row: Record<string, unknown>; rowIndex: number; field: string; title: string }) {
    applyResultClipboardSelections({ ...resultClipboardSelectionsRef.current, [index]: payload })
  }

  function getResultClipboardSelection(index: number) {
    return resultClipboardSelectionsRef.current[index] || null
  }

  function formatClipboardScalar(value: unknown) {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  function formatClipboardTsvValue(value: unknown) {
    const text = formatClipboardScalar(value)
    return /[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  function buildClipboardRowText(result: QueryResult, row: Record<string, unknown>) {
    return result.columns.map((c) => formatClipboardTsvValue(row[c])).join('\t')
  }
  function buildClipboardResultText(result: QueryResult) {
    if (result.columns.length === 0) return ''
    return [
      result.columns.map((c) => formatClipboardTsvValue(c)).join('\t'),
      ...result.rows.map((r) => buildClipboardRowText(result, r as Record<string, unknown>)),
    ].join('\n')
  }
  async function copyTextToClipboard(text: string, successMsg: string) {
    await writeClipboardText(text)
    message.success(successMsg)
  }

  async function copyResultCell(index: number) {
    const sel = getResultClipboardSelection(index)
    if (!sel) { message.warning(t('editor.copy_cell_select_first')); return }
    await copyTextToClipboard(formatClipboardScalar(sel.row[sel.field]), t('editor.copy_cell_success'))
  }
  async function copyResultRow(index: number) {
    const sel = getResultClipboardSelection(index)
    const result = queryResultsRef.current[index]
    if (!sel || !result) { message.warning(t('editor.copy_row_select_first')); return }
    await copyTextToClipboard(buildClipboardRowText(result, sel.row), t('editor.copy_row_success'))
  }
  async function copyResultSet(index: number) {
    const result = queryResultsRef.current[index]
    if (!result || result.columns.length === 0) { message.warning(t('editor.copy_result_empty')); return }
    await copyTextToClipboard(buildClipboardResultText(result), t('editor.copy_result_success', { n: result.rows.length }))
  }
  async function handleCopyMenuClick(index: number, key: string) {
    try {
      if (key === 'cell') await copyResultCell(index)
      else if (key === 'row') await copyResultRow(index)
      else if (key === 'result') await copyResultSet(index)
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  // ── 导出 ──
  function sanitizeFileName(name: string) {
    return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || t('editor.export_default_name')
  }
  function inferInsertTargetTable(index: number) {
    const sql = queryResultStatesRef.current[index]?.sql?.trim() || ''
    const m = sql.replace(/\s+/g, ' ').match(/\bFROM\s+((?:["`\[]?[\w$]+["`\]]?\.)?["`\[]?[\w$]+["`\]]?)/i)
    const target = m?.[1]?.split('.').pop()
    return target ? target.replace(/^["'`[]+|["'`\]]+$/g, '') : `query_result_${index + 1}`
  }
  function inferExportBaseName(index: number, format: string) {
    return sanitizeFileName(`${latestRef.current.selectedDatabase || computeDatabaseLabel(latestRef.current.selectedDatabase)}_${inferInsertTargetTable(index)}.${format}`)
  }
  async function handleExportResult(index: number, format: string) {
    const result = queryResultsRef.current[index]
    if (!result || result.columns.length === 0) return
    try {
      const path = await save({
        defaultPath: inferExportBaseName(index, format),
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      })
      if (!path) return
      if (format === 'csv') await exportApi.toCsv(result, path)
      else if (format === 'json') await exportApi.toJson(result, path)
      else if (format === 'sql') await exportApi.toSql(result, inferInsertTargetTable(index), path)
      message.success(t('data.export_success', { path }))
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  // ── 分隔条拖拽（拖拽期间挂起 Monaco automaticLayout，照抄 Vue 版）──
  function suspendEditorAutomaticLayout() {
    const editor = editorRef.current
    if (!editor) return
    if (editorLayoutResumeRafRef.current) {
      cancelAnimationFrame(editorLayoutResumeRafRef.current)
      editorLayoutResumeRafRef.current = 0
    }
    editorAutoLayoutSuspendCountRef.current++
    if (editorAutoLayoutSuspendCountRef.current === 1) {
      editor.updateOptions({ automaticLayout: false })
    }
  }

  function resumeEditorAutomaticLayout() {
    const editor = editorRef.current
    if (!editor || editorAutoLayoutSuspendCountRef.current === 0) return
    editorAutoLayoutSuspendCountRef.current--
    if (editorAutoLayoutSuspendCountRef.current > 0) return
    editorLayoutResumeRafRef.current = requestAnimationFrame(() => {
      editorLayoutResumeRafRef.current = 0
      editorRef.current?.layout()
      editorRef.current?.updateOptions({ automaticLayout: true })
    })
  }

  function setGlobalResizeState(active: boolean, cursor: string) {
    document.body.style.cursor = active ? cursor : ''
    document.body.style.userSelect = active ? 'none' : ''
    ;(document.body.style as CSSStyleDeclaration & { webkitUserSelect: string }).webkitUserSelect = active ? 'none' : ''
  }

  function getMaxResultPanelHeight() {
    const h = rootRef.current?.clientHeight || 0
    const editorMin = 120
    return h <= 0 ? 420 : Math.max(RESULT_PANEL_MIN_HEIGHT, h - editorMin)
  }

  function startResultResize(e: React.PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    suspendEditorAutomaticLayout()
    isSplitResizingRef.current = true
    setIsSplitResizing(true)
    const target = e.currentTarget as HTMLElement | null
    target?.setPointerCapture?.(e.pointerId)
    const startY = e.clientY
    const startHeight = resultPanelHeightRef.current
    let lastClientY = e.clientY
    let rafId = 0

    const applyResize = () => {
      rafId = 0
      const nextHeight = startHeight - (lastClientY - startY)
      const clamped = Math.min(getMaxResultPanelHeight(), Math.max(RESULT_PANEL_MIN_HEIGHT, nextHeight))
      resultPanelHeightRef.current = clamped
      setResultPanelHeight(clamped)
    }

    const move = (ev: PointerEvent) => {
      if (!isSplitResizingRef.current) return
      lastClientY = ev.clientY
      if (!rafId) rafId = requestAnimationFrame(applyResize)
    }

    const stop = () => {
      if (!isSplitResizingRef.current) return
      isSplitResizingRef.current = false
      setIsSplitResizing(false)
      if (rafId) {
        cancelAnimationFrame(rafId)
        applyResize()
      }
      setStorageItem(RESULT_PANEL_HEIGHT_KEY, resultPanelHeightRef.current)
      resumeEditorAutomaticLayout()
      target?.releasePointerCapture?.(e.pointerId)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      setGlobalResizeState(false, 'row-resize')
    }

    setGlobalResizeState(true, 'row-resize')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
    window.addEventListener('pointercancel', stop, { once: true })
  }

  // 挂载后按容器高度收敛存量高度（对等 Vue onMounted 的 clamp）；
  // 高度变化持久化（拖拽中不写，对等 Vue watch 守卫，拖拽结束时单独落盘）
  useEffect(() => {
    const clamped = Math.min(getMaxResultPanelHeight(), Math.max(RESULT_PANEL_MIN_HEIGHT, resultPanelHeightRef.current))
    if (clamped !== resultPanelHeightRef.current) {
      resultPanelHeightRef.current = clamped
      setResultPanelHeight(clamped)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!isSplitResizingRef.current) setStorageItem(RESULT_PANEL_HEIGHT_KEY, resultPanelHeight)
  }, [resultPanelHeight])

  // 执行状态上报（对等 Vue watch(executionState, deep) → emit）
  const onExecutionStateChangeRef = useRef(props.onExecutionStateChange)
  onExecutionStateChangeRef.current = props.onExecutionStateChange
  useEffect(() => {
    onExecutionStateChangeRef.current?.({ ...execution.executionState })
  }, [execution.executionState])

  // ── 历史记录 / 保存查询 / 片段 ──
  const history = useSqlHistory()
  const [showHistory, setShowHistory] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showSnippets, setShowSnippets] = useState(false)

  function openHistory() { history.setSearchText(''); setShowHistory(true) }
  function openSnippets() { setShowSnippets(true) }

  function handleSnippetInsert(sql: string) {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor) return
    const selection = editor.getSelection()
    if (selection && !selection.isEmpty()) {
      editor.executeEdits('snippet-insert', [{ range: selection, text: sql }])
    } else {
      const position = editor.getPosition()
      if (position) {
        if (!monaco) return
        editor.executeEdits('snippet-insert', [{ range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: sql }])
      } else {
        editor.setValue(sql)
      }
    }
    editor.focus()
  }

  function applyHistorySql(sql: string) {
    editorRef.current?.setValue(sql)
    setShowHistory(false)
  }

  const historyEmptyDescription = history.searchText
    ? t('editor.history_no_match')
    : t('editor.history_empty')

  // ── 补全上下文（bindModel 时机照抄：ready/focus/连接切换/连接列表变化/状态恢复/库切换）──
  const updateAutocompleteContext = useCallback(() => {
    const model = editorRef.current?.getModel()
    const bid = latestRef.current.baseConnectionId
    const store = useConnectionStore.getState()
    const manager = autocompleteRef.current
    if (model && bid && store.connections.length > 0 && manager) {
      const conn = store.connections.find((c) => c.id === bid)
      const fb = latestRef.current.selectedDatabase
        || latestRef.current.initialDatabase
        || conn?.database
        || (conn?.db_type === 'sqlite' ? 'main' : null)
      manager.bindModel(model, { connectionId: bid, database: fb || null, dbType: conn?.db_type || null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAvailableDatabases = useCallback(async () => {
    const bid = latestRef.current.baseConnectionId
    if (!bid) return
    try {
      setAvailableDatabases(await metadataApi.getDatabases(bid))
    } catch {
      setAvailableDatabases([])
    }
  }, [])

  const loadSearchPath = useCallback(async () => {
    if (!latestRef.current.supportsSearchPath) return
    const connId = latestRef.current.baseConnectionId
    if (!connId) return
    try {
      const path = await queryApi.getSearchPath(connId)
      setSearchPathState(path)
      useConnectionStore.getState().setSearchPath(connId, path)
    } catch {
      setSearchPathState('')
      useConnectionStore.getState().setSearchPath(connId, '')
    }
  }, [])

  async function handleSearchPathChange(newPath: string) {
    setSearchPathState(newPath)
    if (!newPath) return
    try {
      await queryApi.setSearchPath(latestRef.current.sessionConnectionId, newPath)
      const connId = latestRef.current.baseConnectionId
      if (connId) {
        useConnectionStore.getState().setSearchPath(connId, newPath)
      }
      updateAutocompleteContext()
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  function handleDatabaseChange(dbName: string) {
    applySelectedDatabase(dbName)
    updateAutocompleteContext()
    latestRef.current.onDatabaseChange?.(dbName)
    message.info(t('editor.database_switched', { database: computeDatabaseLabel(dbName) }))
  }

  async function setSelectedDatabase(db: string) {
    if (latestRef.current.availableDatabasesCount === 0) await loadAvailableDatabases()
    applySelectedDatabase(db)
    updateAutocompleteContext()
    latestRef.current.onDatabaseChange?.(db)
  }

  // ── 当前语句高亮 ──
  const updateCurrentStatementHighlight = useCallback(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco || !decorationRef.current) return
    const model = editor.getModel()
    const position = editor.getPosition()
    if (!model || !position) {
      decorationRef.current.clear()
      return
    }
    const fullText: string = model.getValue()
    const seg = findCurrentStatementInText(fullText, model.getOffsetAt(position))
    if (!seg || seg.sql === fullText.trim()) {
      decorationRef.current.clear()
      return
    }
    const startPos = model.getPositionAt(seg.startOffset)
    const endPos = model.getPositionAt(Math.min(seg.endOffset, fullText.length))
    decorationRef.current.set([{
      range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
      options: {
        isWholeLine: true,
        className: 'current-statement-highlight',
        linesDecorationsClassName: 'current-statement-highlight-gutter',
      },
    }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 编辑器操作 ──
  function focusEditor() {
    const editor = editorRef.current
    if (!editor) return
    editor.layout()
    editor.focus()
  }

  async function formatSql() {
    const editor = editorRef.current
    if (!editor) return
    try {
      const formatted = await queryApi.beautifySql(latestRef.current.sessionConnectionId, editor.getValue())
      editor.setValue(formatted)
      message.success(t('editor.format_success'))
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  function clearEditor() {
    editorRef.current?.setValue('')
    queryResultsRef.current = []
    setQueryResults([])
    applyResultTabKey('result-0')
    errorTabsRef.current = []
    setErrorTabs([])
    resultTabCreatedAtRef.current = {}
    setResultTabCreatedAt({})
    applyQueryResultStates({})
    applyResultClipboardSelections({})
    hideResultContextMenu()
    useRightPanelStore.getState().clearDbMessages()
    execution.hideSummary()
  }

  function handleQuerySaved() { message.success(t('common.save')) }

  async function refreshAutocomplete() {
    const bid = latestRef.current.baseConnectionId
    if (!bid || !autocompleteRef.current) return
    autocompleteRef.current.clearCache(bid)
    updateAutocompleteContext()
    message.success(t('editor.refresh_cache_success'))
  }

  // ── 编辑器剪贴板（照抄 Vue 版：空选区取整行，含 EOL 边界处理）──
  function getEditorSelections() {
    const editor = editorRef.current
    if (!editor) return []
    return editor.getSelections() || (editor.getSelection() ? [editor.getSelection()!] : [])
  }

  function getEditorClipboardEntries() {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel()
    if (!editor || !model) return []
    return getEditorSelections().map((sel: any) => {
      if (!sel.isEmpty()) return { text: model.getValueInRange(sel), deleteRange: sel }
      const ln = sel.positionLineNumber
      const mc = model.getLineMaxColumn(ln)
      if (!monaco) return { text: model.getLineContent(ln), deleteRange: sel }
      if (ln !== model.getLineCount()) return { text: `${model.getLineContent(ln)}${model.getEOL()}`, deleteRange: new monaco.Range(ln, 1, ln + 1, 1) }
      if (ln > 1) return { text: model.getLineContent(ln), deleteRange: new monaco.Range(ln - 1, model.getLineMaxColumn(ln - 1), ln, mc) }
      return { text: model.getLineContent(ln), deleteRange: new monaco.Range(ln, 1, ln, mc) }
    })
  }

  async function copyEditorSelectionToSystemClipboard() {
    const entries = getEditorClipboardEntries()
    if (entries.length) await writeClipboardText(entries.map((entry: any) => entry.text).join(''))
  }

  async function cutEditorSelectionToSystemClipboard() {
    const editor = editorRef.current
    if (!editor) return
    const entries = getEditorClipboardEntries()
    if (!entries.length) return
    await writeClipboardText(entries.map((entry: any) => entry.text).join(''))
    editor.executeEdits('system-clipboard-cut', entries.map((entry: any) => ({ range: entry.deleteRange, text: '' })))
    editor.focus()
  }

  async function pasteFromSystemClipboard() {
    const editor = editorRef.current
    if (!editor) return
    const text = await readClipboardText()
    const sels = getEditorSelections()
    if (!sels.length) return
    editor.executeEdits('system-clipboard-paste', sels.map((r: any) => ({ range: r, text })))
    editor.focus()
  }

  async function handleSystemClipboardAction(action: 'copy' | 'cut' | 'paste') {
    if (!editorRef.current) return
    try {
      focusEditor()
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
      if (action === 'copy') await copyEditorSelectionToSystemClipboard()
      else if (action === 'cut') await cutEditorSelectionToSystemClipboard()
      else await pasteFromSystemClipboard()
    } catch (e: unknown) { message.error(getErrorMessage(e)) }
  }

  // ── 工具栏分发 ──
  function handleAction(method: SqlToolbarAction) {
    const actions: Record<SqlToolbarAction, () => unknown> = {
      executeQuery: () => void executeQueryAction(),
      explainQuery: () => void explainQueryAction(),
      stopExecution: stopExec,
      handleSave: () => latestRef.current.onRequestSave?.(),
      saveAsFile: () => props.onRequestSaveAs?.(),
      formatSql: () => void formatSql(),
      clearEditor,
      openHistory,
      openSnippets,
      refreshAutocomplete: () => void refreshAutocomplete(),
      toggleResultPanel,
    }
    actions[method]?.()
  }
  const handleActionRef = useRef(handleAction)
  handleActionRef.current = handleAction

  // ── Monaco 创建与事件绑定（创建参数照抄 Vue 版 onMounted）──
  const handleEditorReady = useCallback((editor: any, monaco: MonacoModule) => {
    void (async () => {
      autocompleteRef.current = await getSqlAutocompleteManager()
      updateAutocompleteContext()
    })()

    editor.onDidChangeModelContent(() => {
      latestRef.current.onContentChange?.(editor.getValue() || '')
    })
    editor.onDidFocusEditorText(() => {
      updateAutocompleteContext()
    })
    editor.onKeyUp((e: any) => {
      const triggerCodes = [
        monaco.KeyCode.Space,
        monaco.KeyCode.Period,
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => monaco.KeyCode[`Key${c}` as keyof typeof monaco.KeyCode]),
      ]
      if (triggerCodes.includes(e.keyCode)) {
        Promise.resolve(editor.getAction?.('editor.action.triggerSuggest')?.run?.()).catch(() => {})
      }
    })
    editor.addCommand(monaco.KeyCode.F5, () => handleActionRef.current('executeQuery'))
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => latestRef.current.onRequestSave?.())
    decorationRef.current = editor.createDecorationsCollection()
    editor.onDidChangeCursorPosition(() => updateCurrentStatementHighlight())
    editor.onDidChangeModelContent(() => updateCurrentStatementHighlight())
    updateCurrentStatementHighlight()
    requestAnimationFrame(() => { editor.layout(); editor.focus() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { editorRef, monacoRef, ready } = useMonacoEditor(containerRef, {
    value: props.initialValue || '',
    extraOptions: {
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      renderLineHighlight: 'all',
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnCommitCharacter: true,
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      emptySelectionClipboard: false,
      selectionClipboard: false,
    },
    onReady: handleEditorReady,
  })

  // 自动执行（QueryBuilder"执行"等入口传入 nonce；ready 依赖覆盖"编辑器尚未创建"的场景）
  const lastAutoExecuteNonceRef = useRef('')
  useEffect(() => {
    const nonce = props.autoExecuteNonce || ''
    if (!nonce || nonce === lastAutoExecuteNonceRef.current) return
    if (!editorRef.current) return
    lastAutoExecuteNonceRef.current = nonce
    const timer = window.setTimeout(() => void executeQueryAction(), 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.autoExecuteNonce, ready])

  // ── 上下文联动（对等 Vue 版四个 watch；首个 effect 同时承担 onMounted 的初始加载）──
  useEffect(() => {
    updateAutocompleteContext()
    void loadAvailableDatabases()
    void loadSearchPath()
  }, [baseConnectionId, updateAutocompleteContext, loadAvailableDatabases, loadSearchPath])

  useEffect(() => {
    updateAutocompleteContext()
  }, [connections.length, updateAutocompleteContext])

  const connectionStatus = baseConnectionId
    ? connectionStatuses.get(baseConnectionId) || null
    : null
  const skipFirstStatusRef = useRef(true)
  useEffect(() => {
    if (skipFirstStatusRef.current) {
      skipFirstStatusRef.current = false
      return
    }
    if (connectionStatus === 'connected') {
      updateAutocompleteContext()
      void loadAvailableDatabases()
      void loadSearchPath()
    }
  }, [connectionStatus, updateAutocompleteContext, loadAvailableDatabases, loadSearchPath])

  // 对等 Vue 版 onActivated：激活时聚焦 + 刷新上下文
  useEffect(() => {
    if (!props.active) return
    requestAnimationFrame(() => focusEditor())
    updateAutocompleteContext()
    void loadAvailableDatabases()
    void loadSearchPath()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.active])

  // onMounted: 历史记录加载
  useEffect(() => {
    history.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 卸载：hideSummary + 解绑补全上下文（useMonacoEditor 的 dispose 在其自身 effect cleanup 中执行；
  // unbindModel 仅按 model.id 清 map，与 dispose 先后无依赖）
  useEffect(() => () => {
    execution.hideSummary()
    const model = editorRef.current?.getModel()
    if (model && autocompleteRef.current) autocompleteRef.current.unbindModel(model)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 命令式句柄（类型化替代 Vue defineExpose + callActiveEditor 反射）──
  // deps 固定 []：句柄对象只创建一次（省略 deps 会造成回调 ref null↔handle 抖动死循环，见迁移文档踩坑记录）。
  // 句柄内所有方法只允许经 ref（latestRef/editorRef/handleActionRef/executingRef）读状态。
  useImperativeHandle(ref, () => ({
    executeQuery: () => handleActionRef.current('executeQuery'),
    explainQuery: () => handleActionRef.current('explainQuery'),
    stopExecution: () => handleActionRef.current('stopExecution'),
    focusEditor,
    handleSystemClipboardAction: (action) => void handleSystemClipboardAction(action),
    formatSql: () => void formatSql(),
    clearEditor,
    openHistory: () => handleActionRef.current('openHistory'),
    openSnippets: () => handleActionRef.current('openSnippets'),
    refreshAutocomplete: () => void refreshAutocomplete(),
    handleDatabaseChange,
    setSelectedDatabase: (db) => void setSelectedDatabase(db),
    isExecuting: () => execution.executingRef.current,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  // ── 结果 dock 渲染 ──
  const executionState = execution.executionState
  const executing = execution.executing
  const hasAnyResultContent = queryResults.length > 0 || errorTabs.length > 0 || executing

  const orderedTabs: OrderedTab[] = (() => {
    const tabs: OrderedTab[] = []
    errorTabs.forEach((err, i) => {
      tabs.push({ kind: 'error', key: err.key, errorIndex: i, createdAt: err.createdAt })
    })
    queryResults.forEach((_, i) => {
      tabs.push({ kind: 'result', key: `result-${i}`, resultIndex: i, createdAt: resultTabCreatedAt[i] || 0 })
    })
    if (executing) {
      tabs.push({ kind: 'progress', key: 'progress', createdAt: Date.now() })
    }
    tabs.sort((a, b) => a.createdAt - b.createdAt)
    return tabs
  })()

  const executionStatusLabel = t(`editor.status.${executionState.status}`)
  const executionElapsedLabel = (() => {
    const elapsed = executionState.elapsedMs || 0
    if (elapsed <= 0) return ''
    return formatElapsed(elapsed)
  })()

  const renderErrorTabLabel = (err: ErrorTabInfo, index: number) => (
    <span className={styles.resultTabLabel} onContextMenu={(e) => e.preventDefault()}>
      <CloseCircleOutlined className={styles.errorTabIcon} />
      <span className={styles.resultTabTitle}>
        {err.status === 'cancelled' ? t('editor.status.cancelled') : t('editor.status.failed')}
      </span>
      <button
        className={styles.resultTabClose}
        type="button"
        title={t('common.close')}
        aria-label={t('common.close')}
        onClick={(e) => { e.stopPropagation(); closeErrorTab(index) }}
      >
        <CloseOutlined />
      </button>
    </span>
  )

  const renderErrorTabContent = (err: ErrorTabInfo) => (
    <div className={styles.executionErrorTab}>
      <div className={styles.errorCenter}>
        <CloseCircleOutlined className={styles.errorIcon} />
        <div className={styles.errorTitle}>
          {err.status === 'cancelled' ? t('editor.summary.query_cancelled') : t('editor.execution_failed')}
        </div>
        <div className={styles.errorSummary}>{err.summary}</div>
        {err.detail && <div className={styles.errorDetail}>{err.detail}</div>}
        {err.elapsedMs > 0 && <div className={styles.errorTime}>{t('editor.elapsed')} {formatElapsed(err.elapsedMs)}</div>}
      </div>
    </div>
  )

  const renderResultTabContent = (result: QueryResult, index: number) => {
    if (result.columns.length === 0 && result.rows.length === 0) {
      return (
        <div className={styles.resultContent}>
          <div className={styles.resultEmptyDdl}>
            <CheckCircleOutlined className={styles.ddlSuccessIcon} />
            <span className={styles.ddlSuccessText}>{t('editor.exec_success_simple')}</span>
            <span className={styles.ddlElapsed}>{t('editor.elapsed')} {result.execution_time_ms} ms</span>
            {result.affected_rows > 0 && (
              <span className={styles.ddlAffected}>{t('editor.affected_rows', { n: result.affected_rows })}</span>
            )}
          </div>
        </div>
      )
    }
    const state = queryResultStates[index]
    const hasSelection = Boolean(resultClipboardSelections[index])
    const noColumns = result.columns.length === 0
    return (
      <div className={styles.resultContent}>
        <div className={styles.resultInfo}>
          <Space>
            <Tag color="success">{t('editor.loaded_rows', { n: result.rows.length })}</Tag>
            <Tag color="processing">{result.execution_time_ms} ms</Tag>
            {result.affected_rows > 0 && (
              <span className={styles.affectedText}>{t('editor.affected_rows', { n: result.affected_rows })}</span>
            )}
          </Space>
          <Space size={8}>
            <Dropdown
              menu={{
                items: [
                  { key: 'cell', disabled: !hasSelection, label: t('editor.copy_cell') },
                  { key: 'row', disabled: !hasSelection, label: t('editor.copy_row') },
                  { key: 'result', disabled: noColumns, label: t('editor.copy_result_set') },
                ],
                onClick: ({ key }) => void handleCopyMenuClick(index, String(key)),
              }}
            >
              <Button size="small" icon={<CopyOutlined />} disabled={noColumns}>{t('common.copy')}</Button>
            </Dropdown>
            <Dropdown
              menu={{
                items: [
                  { key: 'csv', label: t('data.export_csv') },
                  { key: 'json', label: t('data.export_json') },
                  { key: 'sql', label: t('data.export_sql') },
                ],
                onClick: ({ key }) => void handleExportResult(index, String(key)),
              }}
            >
              <Button size="small" icon={<ExportOutlined />} disabled={noColumns}>{t('editor.export_result')}</Button>
            </Dropdown>
          </Space>
        </div>
        <div className={styles.tableWrapper}>
          <Suspense fallback={null}>
            <ResultGrid
              result={result}
              loading={state?.loading || false}
              onCellClick={(payload) => handleResultCellClick(index, payload)}
              onReachBottom={() => handleResultGridReachBottom(index)}
            />
          </Suspense>
        </div>
      </div>
    )
  }

  const renderProgressTabContent = () => (
    <div className={styles.executionProgressTab}>
      <div className={styles.progressTabCenter}>
        <div className={styles.progressStatus}>{executionStatusLabel}</div>
        <div className={styles.progressSummaryText}>{executionState.summary}</div>
        <div className={styles.progressStats}>
          {executionState.statementCount > 1 && (
            <div className={styles.statItem}>
              <span className={styles.statLabel}>{t('editor.progress.statements')}</span>
              <span className={styles.statValue}>{executionState.completedStatements}/{executionState.statementCount}</span>
            </div>
          )}
          {executionState.resultSetCount > 0 && (
            <div className={styles.statItem}>
              <span className={styles.statLabel}>{t('editor.progress.result_sets')}</span>
              <span className={styles.statValue}>{executionState.resultSetCount}</span>
            </div>
          )}
          {executionState.affectedRows > 0 && (
            <div className={styles.statItem}>
              <span className={styles.statLabel}>{t('editor.progress.affected_rows')}</span>
              <span className={styles.statValue}>{executionState.affectedRows}</span>
            </div>
          )}
          {executionElapsedLabel && (
            <div className={`${styles.statItem} ${styles.timer}`}>
              <span className={styles.statLabel}>{t('editor.progress.elapsed')}</span>
              <span className={styles.statValue}>{executionElapsedLabel}</span>
            </div>
          )}
        </div>
        <Button danger type="primary" size="small" icon={<StopOutlined />} onClick={stopExec} className={styles.progressStopBtn}>
          {t('editor.stop_exec')}
        </Button>
      </div>
    </div>
  )

  const resultDockItems = orderedTabs.map((tab) => {
    if (tab.kind === 'error' && tab.errorIndex != null) {
      const err = errorTabs[tab.errorIndex]
      return { key: tab.key, label: renderErrorTabLabel(err, tab.errorIndex), children: renderErrorTabContent(err) }
    }
    if (tab.kind === 'result' && tab.resultIndex != null) {
      const idx = tab.resultIndex
      return {
        key: tab.key,
        label: (
          <span
            className={styles.resultTabLabel}
            onContextMenu={(e) => { e.preventDefault(); handleResultTabContextMenu(e, idx) }}
          >
            <span className={styles.resultTabTitle}>
              {queryResults.length > 1 ? t('editor.result_n', { n: idx + 1 }) : t('editor.result')}
            </span>
            <button
              className={styles.resultTabClose}
              type="button"
              title={t('common.close')}
              aria-label={t('common.close')}
              onClick={(e) => { e.stopPropagation(); closeResultAt(idx) }}
            >
              <CloseOutlined />
            </button>
          </span>
        ),
        children: renderResultTabContent(queryResults[idx], idx),
      }
    }
    return {
      key: tab.key,
      label: (
        <span className={styles.resultTabLabel}>
          <LoadingOutlined spin className={styles.progressTabIcon} />
          <span className={styles.resultTabTitle}>{t('editor.status.running')}</span>
        </span>
      ),
      children: renderProgressTabContent(),
    }
  })

  const resultDockHeight = resultPanelVisible ? resultPanelHeight : RESULT_PANEL_COLLAPSED_HEIGHT

  return (
    <div
      ref={rootRef}
      className={`${styles.container} ${isSplitResizing ? styles.isResizingResult : ''}`}
    >
      <SqlToolbar
        executing={executing}
        selectedDatabase={selectedDatabase}
        databases={availableDatabases}
        resultPanelVisible={resultPanelVisible}
        showSearchPath={supportsSearchPath}
        searchPath={searchPath}
        onAction={handleAction}
        onDatabaseChange={handleDatabaseChange}
        onSearchPathChange={(v) => void handleSearchPathChange(v)}
      />
      <div className={styles.editorWorkbench}>
        <div className={styles.editorSection}>
          <div ref={containerRef} className={styles.monacoContainer} />
        </div>
      </div>

      {/* 结果面板拖拽条（在结果面板外部，不受 overflow:hidden 影响） */}
      {resultPanelVisible && (
        <div className={styles.splitResizer} onPointerDown={startResultResize}>
          <div className={styles.resizerHandle} />
        </div>
      )}

      <div
        className={`${styles.resultDock} ${!resultPanelVisible ? styles.collapsed : ''}`}
        style={{ height: `${resultDockHeight}px` }}
      >
        {hasAnyResultContent ? (
          <Tabs
            activeKey={resultTabKey}
            onChange={applyResultTabKey}
            size="small"
            className={styles.resultTabs}
            items={resultDockItems}
          />
        ) : (
          <div className={styles.resultContent}>
            <div className={styles.resultEmptyState} />
          </div>
        )}
      </div>

      {resultContextMenuVisible && (
        <div className="app-context-menu-overlay" onClick={() => hideResultContextMenu()}>
          <div
            className="app-context-menu"
            style={{ left: resultContextMenuX, top: resultContextMenuY }}
            onClick={(e) => e.stopPropagation()}
          >
            <Menu
              onClick={handleResultMenuClick}
              selectable={false}
              mode="inline"
              items={[
                { key: 'close-current', disabled: resultContextIndex < 0, label: t('common.close') },
                { key: 'close-left', disabled: !hasResultTabsOnLeft, label: t('common.close_left') },
                { key: 'close-right', disabled: !hasResultTabsOnRight, label: t('common.close_right') },
              ]}
            />
          </div>
        </div>
      )}

      <Drawer
        title={t('editor.history_title')}
        placement="right"
        open={showHistory}
        onClose={() => setShowHistory(false)}
        width={400}
      >
        <div className={styles.historyPanel}>
          <div className={styles.historyToolbar}>
            <Input
              value={history.searchText}
              onChange={(e) => history.setSearchText(e.target.value)}
              allowClear
              size="small"
              placeholder={t('editor.history_search_placeholder')}
            />
            <span className={styles.historyCount}>{history.filteredHistory.length}</span>
          </div>
          {history.filteredHistory.length > 0 ? (
            <List
              dataSource={history.filteredHistory}
              size="small"
              className={styles.historyList}
              renderItem={(item) => (
                <List.Item
                  className="interactive-row interactive-row--soft"
                  onClick={() => applyHistorySql(item.sql)}
                >
                  <div className={styles.historyEntry}>
                    <code className={styles.historySql}>{history.getPreview(item.sql)}</code>
                    <div className={styles.historyMeta}>{history.formatMeta(item)}</div>
                  </div>
                </List.Item>
              )}
            />
          ) : (
            <Empty description={historyEmptyDescription} />
          )}
        </div>
      </Drawer>

      <SaveQueryDialog
        open={showSaveDialog}
        sql={editorRef.current?.getValue() || ''}
        onClose={() => setShowSaveDialog(false)}
        onSaved={handleQuerySaved}
      />
      <SqlSnippetsManager
        open={showSnippets}
        onClose={() => setShowSnippets(false)}
        onInsert={handleSnippetInsert}
      />
    </div>
  )
})

export default SqlEditor
