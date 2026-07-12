import { useCallback, useRef, useState } from 'react'
import { message, Modal } from '../ui/antd'
import type { QueryResult } from '@/types/database'
import type { QueryBatchExecutionResult } from '@/api/query'
import { queryApi } from '@/api'
import { createIdleExecutionState, type SqlExecutionState, type SqlExecutionStatus } from '@/types/sqlExecution'
import { analyzeSqlSafety, analyzeSqlWrites, type SqlDangerIssue } from '@/utils/sqlSafety'
import { getErrorMessage } from '@/utils/errorHandler'

/**
 * SQL 执行链 hook（对等 Vue 版 useSqlExecution，11 个回调注入结构照抄）。
 * 危险 SQL 五类确认 / 只读拦截 / queryId 取消与 isStale / prepareSqlScript 拆句 +
 * can_page 自动加 LIMIT 100——全部逐行平移。
 *
 * 范式差异：Vue 的 ref 同步读写改为「useState（驱动渲染）+ useRef 镜像（异步流程内同步读）」；
 * callbacks 经 ref 每渲染刷新，异步回调始终读到最新注入。
 */

export interface ExecutionCallbacks {
  /** 编辑器 SQL 获取器 */
  getSql: () => string
  /** 编辑器选中内容获取器 */
  getSelectionSql: () => string | null
  /** 光标所在完整语句获取器 */
  getCurrentStatementSql: () => string | null
  /** 当前连接是否为只读 */
  isReadOnly: () => boolean
  /** 追加查询结果，返回起始索引 */
  onAppendResults: (results: QueryResult[], states: ResultPageState[]) => number
  /** 切换到指定 Tab */
  onSwitchToTab: (tabKey: string) => void
  /** 添加错误 Tab (持久化) */
  onAddErrorTab: (status: 'failed' | 'cancelled' | 'partial_success', summary: string, detail: string, elapsedMs: number) => void
  /** 展开结果面板 */
  onRevealPanel: () => void
  /** 添加数据库消息 (NOTICE, DEBUG, WARNING 等) */
  onDbMessage: (severity: string, text: string) => void
  /** 保存到历史记录 */
  onSaveHistory: (sql: string) => void
  /** i18n 翻译 */
  t: (key: string, options?: Record<string, unknown>) => string
}

export interface ResultPageState {
  pagination: { current: number; pageSize: number }
  loading: boolean
  hasMore: boolean
  sql: string
}

function isCancelledMessage(messageText: string) {
  const n = messageText.toLowerCase()
  return n.includes('cancelled') || n.includes('canceled') ||
    n.includes('canceling statement due to user request') ||
    n.includes('interrupted')
}

const executionStatusColorMap: Record<SqlExecutionStatus, string> = {
  idle: 'default', running: 'processing', success: 'success',
  failed: 'error', cancelled: 'warning', partial_success: 'gold',
}

export function useSqlExecution(callbacks: ExecutionCallbacks) {
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  const [executing, setExecutingState] = useState(false)
  const [executionState, setExecutionStateValue] = useState<SqlExecutionState>(createIdleExecutionState())
  const [showExecutionSummary, setShowExecutionSummary] = useState(false)
  const [executionStatusColor, setExecutionStatusColor] = useState(executionStatusColorMap.idle)

  // 异步流程内同步读的镜像
  const executingRef = useRef(false)
  const executionStateRef = useRef(executionState)
  const executionSeqRef = useRef(0)
  const activeExecutionIdRef = useRef(0)
  const executionSummaryVisibleRef = useRef(false)
  const executionSummaryTimerRef = useRef<number | null>(null)
  const executionTickerRef = useRef<number | null>(null)

  function setExecuting(value: boolean) {
    executingRef.current = value
    setExecutingState(value)
  }

  function updateShowSummary() {
    setShowExecutionSummary(
      executionSummaryVisibleRef.current &&
      executionStateRef.current.status !== 'idle' &&
      Boolean(executionStateRef.current.summary),
    )
    setExecutionStatusColor(executionStatusColorMap[executionStateRef.current.status])
  }

  const updateExecutionState = useCallback((patch: Partial<SqlExecutionState> & { status?: SqlExecutionStatus }) => {
    executionStateRef.current = { ...executionStateRef.current, ...patch, updatedAt: Date.now() }
    setExecutionStateValue(executionStateRef.current)
    updateShowSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopExecutionTicker() {
    if (executionTickerRef.current !== null) {
      clearInterval(executionTickerRef.current)
      executionTickerRef.current = null
    }
  }

  function startExecutionTicker() {
    stopExecutionTicker()
    executionTickerRef.current = window.setInterval(() => {
      const startedAt = executionStateRef.current.startedAt
      if (!startedAt || executionStateRef.current.status !== 'running') return
      updateExecutionState({ elapsedMs: Date.now() - startedAt })
    }, 200)
  }

  function finalizeExecutionState(
    status: SqlExecutionStatus,
    summary: string,
    options: Partial<Omit<SqlExecutionState, 'status' | 'summary' | 'updatedAt'>> = {},
  ) {
    stopExecutionTicker()
    updateExecutionState({
      status, summary,
      detail: options.detail || '',
      mode: options.mode ?? executionStateRef.current.mode,
      statementCount: options.statementCount ?? executionStateRef.current.statementCount,
      completedStatements: options.completedStatements ?? executionStateRef.current.completedStatements,
      resultSetCount: options.resultSetCount ?? executionStateRef.current.resultSetCount,
      affectedRows: options.affectedRows ?? executionStateRef.current.affectedRows,
      elapsedMs: options.elapsedMs ?? executionStateRef.current.elapsedMs,
    })
    keepSummaryVisible()
  }

  function getAffectedRows(results: QueryResult[]) {
    return results.reduce((acc, r) => acc + r.affected_rows, 0)
  }

  function applyBatchExecutionState(response: QueryBatchExecutionResult) {
    const rsc = response.results.length
    const ar = getAffectedRows(response.results)
    const cs = response.statements_succeeded
    const sc = response.statements_total
    const { t } = callbacksRef.current
    const elapsedMs = response.execution_time_ms || 0

    // 转发数据库消息 (NOTICE, DEBUG, WARNING 等)
    if (response.messages) {
      for (const msg of response.messages) {
        callbacksRef.current.onDbMessage(msg.severity || 'info', msg.text)
      }
    }

    if (response.was_cancelled) {
      const status: SqlExecutionStatus = cs > 0 ? 'partial_success' : 'cancelled'
      const summary = cs > 0
        ? t('editor.summary.query_cancelled_partial', { success: cs, total: sc })
        : t('editor.summary.query_cancelled')
      finalizeExecutionState(status, summary, { mode: 'query', statementCount: sc, completedStatements: cs, resultSetCount: rsc, affectedRows: ar, elapsedMs })
      callbacksRef.current.onAddErrorTab(status === 'partial_success' ? 'partial_success' : 'cancelled', summary, '', elapsedMs)
      return
    }
    if (response.error_message) {
      const status: SqlExecutionStatus = cs > 0 ? 'partial_success' : 'failed'
      const summary = cs > 0
        ? t('editor.summary.query_partial', { success: cs, total: sc, failed: response.failed_statement_index || cs + 1 })
        : t('editor.summary.query_failed', { failed: response.failed_statement_index || 1 })
      finalizeExecutionState(status, summary, { mode: 'query', detail: response.error_message, statementCount: sc, completedStatements: cs, resultSetCount: rsc, affectedRows: ar, elapsedMs })
      callbacksRef.current.onAddErrorTab(status === 'partial_success' ? 'partial_success' : 'failed', summary, response.error_message, elapsedMs)
      return
    }
    const summary = rsc > 0
      ? t('editor.summary.query_success', { count: cs, sets: rsc })
      : t('editor.summary.query_success_empty', { count: cs })
    finalizeExecutionState('success', summary, { mode: 'query', statementCount: sc, completedStatements: cs, resultSetCount: rsc, affectedRows: ar, elapsedMs })
  }

  function showSummaryTemporarily(duration = 3600) {
    executionSummaryVisibleRef.current = true
    updateShowSummary()
    if (executionSummaryTimerRef.current !== null) clearTimeout(executionSummaryTimerRef.current)
    if (duration > 0) {
      executionSummaryTimerRef.current = window.setTimeout(() => {
        executionSummaryVisibleRef.current = false
        updateShowSummary()
        executionSummaryTimerRef.current = null
      }, duration)
    }
  }

  function keepSummaryVisible() { showSummaryTemporarily(0) }

  const hideSummary = useCallback(() => {
    executionSummaryVisibleRef.current = false
    updateShowSummary()
    stopExecutionTicker()
    if (executionSummaryTimerRef.current !== null) {
      clearTimeout(executionSummaryTimerRef.current)
      executionSummaryTimerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function beginExecution(mode: 'query' | 'explain', statementCount = 1) {
    const id = executionSeqRef.current + 1
    executionSeqRef.current = id
    activeExecutionIdRef.current = id
    setExecuting(true)
    const { t } = callbacksRef.current
    const startedAt = Date.now()
    updateExecutionState({
      status: 'running', mode,
      summary: mode === 'query' ? t('editor.summary.running_query', { count: statementCount }) : t('editor.summary.running_explain'),
      detail: '', statementCount, completedStatements: 0, resultSetCount: 0, affectedRows: 0,
      startedAt, elapsedMs: 0,
    })
    startExecutionTicker()
    keepSummaryVisible()
    callbacksRef.current.onSwitchToTab('progress')
    callbacksRef.current.onRevealPanel()
    return id
  }

  function isStale(executionId: number) {
    return executionId !== activeExecutionIdRef.current
  }

  async function confirmDangerousExecution(issues: SqlDangerIssue[]) {
    if (issues.length === 0) return true
    const { t } = callbacksRef.current

    return new Promise<boolean>((resolve) => {
      const content = (
        <div className="danger-confirm-content">
          <p className="danger-confirm-intro">{t('editor.danger.confirm_intro')}</p>
          <ul className="danger-confirm-list">
            {issues.map((issue, i) => (
              <li key={`${issue.type}-${i}`}>
                {`${t(`editor.danger.${issue.type}`)}: ${issue.statement.replace(/\s+/g, ' ').trim().slice(0, 160)}`}
              </li>
            ))}
          </ul>
        </div>
      )
      Modal.confirm({
        title: t('editor.danger.confirm_title'),
        content, okText: t('editor.danger.confirm_ok'), cancelText: t('common.cancel'),
        okType: 'danger', width: 720,
        onOk: () => { void message.warning(t('editor.danger.confirmed')); resolve(true) },
        onCancel: () => { void message.info(t('editor.danger.cancelled')); resolve(false) },
      })
    })
  }

  // ── 核心执行管线 ──

  async function executeQuery(connId: string, database: string | null) {
    const { t } = callbacksRef.current
    const fullSql = callbacksRef.current.getSelectionSql() || callbacksRef.current.getCurrentStatementSql() || callbacksRef.current.getSql()
    if (!fullSql.trim()) return message.warning(t('editor.input_sql_warn'))

    let executionId: number | null = null

    try {
      const preparedStatements = await queryApi.prepareSqlScript(connId, fullSql, { allowReconnectRetry: true })
      if (preparedStatements.length === 0) return

      const writeAnalysis = analyzeSqlWrites(preparedStatements.map(s => s.sql))
      if (callbacksRef.current.isReadOnly() && writeAnalysis.hasWrites) {
        const warn = t('editor.read_only_blocked', { count: writeAnalysis.writeStatements.length })
        message.warning(warn)
        return
      }

      const safetyAnalysis = analyzeSqlSafety(preparedStatements.map(s => s.sql))
      if (!await confirmDangerousExecution(safetyAnalysis.issues)) return

      executionId = beginExecution('query', preparedStatements.length)

      // Note: currentDatabaseLabel is handled by caller
      const processedStatements = preparedStatements.map(s => s.can_page ? `${s.sql} LIMIT 100` : s.sql)
      const response = await queryApi.executeQueryBatch(connId, processedStatements, database, executionId, { allowReconnectRetry: true })
      if (isStale(executionId)) return

      const appendedIndex = callbacksRef.current.onAppendResults(
        response.results,
        response.results.map((r, i) => {
          const cfg = preparedStatements[i] || preparedStatements[preparedStatements.length - 1]
          return { pagination: { current: 1, pageSize: 100 }, loading: false, hasMore: Boolean(cfg.can_page) && r.rows.length === 100, sql: cfg.sql || '' }
        }),
      )

      applyBatchExecutionState(response)
      callbacksRef.current.onRevealPanel()
      // 仅在成功时切换到结果 tab（失败时 onAddErrorTab 已设置）
      if (!response.error_message && !response.was_cancelled) {
        callbacksRef.current.onSwitchToTab(response.results.length > 0 ? `result-${appendedIndex}` : 'empty')
        callbacksRef.current.onSaveHistory(fullSql)
      }
    } catch (e: unknown) {
      if (executionId !== null && isStale(executionId)) return
      const errMsg = getErrorMessage(e)
      if (isCancelledMessage(errMsg)) {
        finalizeExecutionState('cancelled', t('editor.summary.query_cancelled'), {
          mode: 'query', statementCount: executionStateRef.current.statementCount,
          completedStatements: executionStateRef.current.completedStatements,
        })
        callbacksRef.current.onAddErrorTab('cancelled', t('editor.summary.query_cancelled'), '', executionStateRef.current.elapsedMs || 0)
      } else {
        message.error(errMsg)
        finalizeExecutionState('failed', t('editor.summary.query_failed', { failed: 1 }), {
          mode: 'query', detail: errMsg, statementCount: executionStateRef.current.statementCount || 1, completedStatements: 0,
        })
        callbacksRef.current.onAddErrorTab('failed', t('editor.summary.query_failed', { failed: 1 }), errMsg, executionStateRef.current.elapsedMs || 0)
      }
    } finally {
      if (executionId !== null && !isStale(executionId)) setExecuting(false)
    }
  }

  async function explainQuery(connId: string, database: string | null) {
    const { t } = callbacksRef.current
    const sql = callbacksRef.current.getSelectionSql() || callbacksRef.current.getCurrentStatementSql() || callbacksRef.current.getSql()
    if (!sql.trim()) return message.warning(t('editor.input_sql_warn'))

    const executionId = beginExecution('explain')
    try {
      const results = await queryApi.explainQuery(connId, sql, database, executionId, { allowReconnectRetry: true })
      if (isStale(executionId)) return

      const appendedIndex = callbacksRef.current.onAppendResults(
        results,
        results.map(() => ({ pagination: { current: 1, pageSize: 100 }, loading: false, hasMore: false, sql: '' })),
      )
      callbacksRef.current.onRevealPanel()
      callbacksRef.current.onSwitchToTab(`result-${appendedIndex}`)
      finalizeExecutionState('success', t('editor.summary.explain_success', { sets: results.length }), {
        mode: 'explain', statementCount: 1, completedStatements: 1,
        resultSetCount: results.length, affectedRows: getAffectedRows(results),
      })
    } catch (e: unknown) {
      if (isStale(executionId)) return
      const errMsg = getErrorMessage(e)
      if (isCancelledMessage(errMsg)) {
        finalizeExecutionState('cancelled', t('editor.summary.explain_cancelled'), {
          mode: 'explain', statementCount: 1, completedStatements: 0,
        })
        callbacksRef.current.onAddErrorTab('cancelled', t('editor.summary.explain_cancelled'), '', executionStateRef.current.elapsedMs || 0)
      } else {
        message.error(errMsg)
        finalizeExecutionState('failed', t('editor.summary.explain_failed'), {
          mode: 'explain', detail: errMsg, statementCount: 1, completedStatements: 0,
        })
        callbacksRef.current.onAddErrorTab('failed', t('editor.summary.explain_failed'), errMsg, executionStateRef.current.elapsedMs || 0)
      }
    } finally {
      if (!isStale(executionId)) setExecuting(false)
    }
  }

  async function stopExecution(connId: string) {
    const eid = activeExecutionIdRef.current
    const prev = executionStateRef.current
    activeExecutionIdRef.current = executionSeqRef.current + 1
    setExecuting(false)
    stopExecutionTicker()

    if (connId && eid > 0) {
      try { await queryApi.cancelQuery(connId, eid) } catch { /* ignore */ }
    }

    finalizeExecutionState('cancelled', callbacksRef.current.t('editor.manual_stop'), {
      mode: prev.mode, statementCount: prev.statementCount,
      completedStatements: prev.completedStatements, resultSetCount: prev.resultSetCount,
      affectedRows: prev.affectedRows, elapsedMs: prev.elapsedMs,
    })
    callbacksRef.current.onAddErrorTab('cancelled', callbacksRef.current.t('editor.manual_stop'), '', prev.elapsedMs || 0)
  }

  return {
    executing,
    executionState,
    showExecutionSummary,
    executionStatusColor,
    executingRef,
    executionStateRef,
    // Actions
    executeQuery,
    explainQuery,
    stopExecution,
    beginExecution,
    isStale,
    updateExecutionState,
    finalizeExecutionState,
    hideSummary,
    applyBatchExecutionState,
  }
}
