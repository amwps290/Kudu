import { ref, h } from 'vue'
import { message, Modal } from 'ant-design-vue'
import type { QueryResult } from '@/types/database'
import type { QueryBatchExecutionResult } from '@/api/query'
import { queryApi } from '@/api'
import { createIdleExecutionState, type SqlExecutionState, type SqlExecutionStatus } from '@/types/sqlExecution'
import { analyzeSqlSafety, analyzeSqlWrites, type SqlDangerIssue } from '@/utils/sqlSafety'

export interface ExecutionCallbacks {
  /** 编辑器 SQL 获取器 */
  getSql: () => string
  /** 编辑器选中内容获取器 */
  getSelectionSql: () => string | null
  /** 当前连接是否为只读 */
  isReadOnly: () => boolean
  /** 追加查询结果，返回起始索引 */
  onAppendResults: (results: QueryResult[], states: ResultPageState[]) => number
  /** 切换到指定结果 Tab */
  onSwitchToResultTab: (tabKey: string) => void
  /** 展开结果面板 */
  onRevealPanel: () => void
  /** 添加消息 */
  onAddMessage: (type: string, text: string) => void
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

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const messageValue = Reflect.get(error, 'message')
    if (typeof messageValue === 'string' && messageValue.trim()) return messageValue
    const errorValue = Reflect.get(error, 'error')
    if (typeof errorValue === 'string' && errorValue.trim()) return errorValue
    const causeValue = Reflect.get(error, 'cause')
    if (causeValue) {
      const causeMessage = getErrorMessage(causeValue)
      if (causeMessage && causeMessage !== '[object Object]') return causeMessage
    }
    try { return JSON.stringify(error) } catch { return String(error) }
  }
  return String(error)
}

function isCancelledMessage(messageText: string) {
  const n = messageText.toLowerCase()
  return n.includes('cancelled') || n.includes('canceled') ||
    n.includes('canceling statement due to user request') ||
    n.includes('interrupted')
}

export function useSqlExecution(callbacks: ExecutionCallbacks) {
  const executing = ref(false)
  const executionSeq = ref(0)
  const activeExecutionId = ref(0)
  const executionState = ref<SqlExecutionState>(createIdleExecutionState())
  const executionSummaryVisible = ref(false)
  let executionSummaryTimer: number | null = null

  const executionStatusColorMap: Record<SqlExecutionStatus, string> = {
    idle: 'default', running: 'processing', success: 'success',
    failed: 'error', cancelled: 'warning', partial_success: 'gold',
  }
  const executionStatusColor = ref(executionStatusColorMap[executionState.value.status])
  const showExecutionSummary = ref(false)

  function updateShowSummary() {
    showExecutionSummary.value = executionSummaryVisible.value &&
      executionState.value.status !== 'idle' &&
      Boolean(executionState.value.summary)
    executionStatusColor.value = executionStatusColorMap[executionState.value.status]
  }

  function updateExecutionState(patch: Partial<SqlExecutionState> & { status?: SqlExecutionStatus }) {
    executionState.value = { ...executionState.value, ...patch, updatedAt: Date.now() }
    updateShowSummary()
  }

  function finalizeExecutionState(
    status: SqlExecutionStatus,
    summary: string,
    options: Partial<Omit<SqlExecutionState, 'status' | 'summary' | 'updatedAt'>> = {}
  ) {
    updateExecutionState({
      status, summary,
      detail: options.detail || '',
      mode: options.mode ?? executionState.value.mode,
      statementCount: options.statementCount ?? executionState.value.statementCount,
      completedStatements: options.completedStatements ?? executionState.value.completedStatements,
      resultSetCount: options.resultSetCount ?? executionState.value.resultSetCount,
      affectedRows: options.affectedRows ?? executionState.value.affectedRows,
    })
    callbacks.onAddMessage(getMessageTypeForStatus(status), summary)
    if (options.detail) callbacks.onAddMessage('error', options.detail)
    showSummaryTemporarily()
  }

  function getMessageTypeForStatus(status: SqlExecutionStatus): string {
    switch (status) {
      case 'success': return 'success'
      case 'failed': return 'error'
      case 'cancelled':
      case 'partial_success': return 'warning'
      default: return 'info'
    }
  }

  function getAffectedRows(results: QueryResult[]) {
    return results.reduce((acc, r) => acc + r.affected_rows, 0)
  }

  function applyBatchExecutionState(response: QueryBatchExecutionResult) {
    const rsc = response.results.length
    const ar = getAffectedRows(response.results)
    const cs = response.statements_succeeded
    const sc = response.statements_total
    const { t } = callbacks

    if (response.was_cancelled) {
      const status: SqlExecutionStatus = cs > 0 ? 'partial_success' : 'cancelled'
      const summary = cs > 0
        ? t('editor.summary.query_cancelled_partial', { success: cs, total: sc })
        : t('editor.summary.query_cancelled')
      finalizeExecutionState(status, summary, { mode: 'query', statementCount: sc, completedStatements: cs, resultSetCount: rsc, affectedRows: ar })
      return
    }
    if (response.error_message) {
      const status: SqlExecutionStatus = cs > 0 ? 'partial_success' : 'failed'
      const summary = cs > 0
        ? t('editor.summary.query_partial', { success: cs, total: sc, failed: response.failed_statement_index || cs + 1 })
        : t('editor.summary.query_failed', { failed: response.failed_statement_index || 1 })
      finalizeExecutionState(status, summary, { mode: 'query', detail: response.error_message, statementCount: sc, completedStatements: cs, resultSetCount: rsc, affectedRows: ar })
      return
    }
    const summary = rsc > 0
      ? t('editor.summary.query_success', { count: cs, sets: rsc })
      : t('editor.summary.query_success_empty', { count: cs })
    finalizeExecutionState('success', summary, { mode: 'query', statementCount: sc, completedStatements: cs, resultSetCount: rsc, affectedRows: ar })
  }

  function showSummaryTemporarily(duration = 3600) {
    executionSummaryVisible.value = true
    updateShowSummary()
    if (executionSummaryTimer !== null) clearTimeout(executionSummaryTimer)
    if (duration > 0) {
      executionSummaryTimer = window.setTimeout(() => {
        executionSummaryVisible.value = false
        updateShowSummary()
        executionSummaryTimer = null
      }, duration)
    }
  }

  function keepSummaryVisible() { showSummaryTemporarily(0) }
  function hideSummary() {
    executionSummaryVisible.value = false
    updateShowSummary()
    if (executionSummaryTimer !== null) { clearTimeout(executionSummaryTimer); executionSummaryTimer = null }
  }

  function beginExecution(mode: 'query' | 'explain', statementCount = 1) {
    const id = executionSeq.value + 1
    executionSeq.value = id
    activeExecutionId.value = id
    executing.value = true
    const { t } = callbacks
    updateExecutionState({
      status: 'running', mode,
      summary: mode === 'query' ? t('editor.summary.running_query', { count: statementCount }) : t('editor.summary.running_explain'),
      detail: '', statementCount, completedStatements: 0, resultSetCount: 0, affectedRows: 0,
    })
    keepSummaryVisible()
    return id
  }

  function isStale(executionId: number) {
    return executionId !== activeExecutionId.value
  }

  async function confirmDangerousExecution(issues: SqlDangerIssue[]) {
    if (issues.length === 0) return true
    const { t } = callbacks

    return new Promise<boolean>((resolve) => {
      const content = h('div', { class: 'danger-confirm-content' }, [
        h('p', { class: 'danger-confirm-intro' }, t('editor.danger.confirm_intro')),
        h('ul', { class: 'danger-confirm-list' }, issues.map((issue, i) =>
          h('li', { key: `${issue.type}-${i}` },
            `${t(`editor.danger.${issue.type}`)}: ${issue.statement.replace(/\s+/g, ' ').trim().slice(0, 160)}`
          )
        )),
      ])
      Modal.confirm({
        title: t('editor.danger.confirm_title'),
        content, okText: t('editor.danger.confirm_ok'), cancelText: t('common.cancel'),
        okType: 'danger', width: 720,
        onOk: () => { callbacks.onAddMessage('warning', t('editor.danger.confirmed')); resolve(true) },
        onCancel: () => { callbacks.onAddMessage('info', t('editor.danger.cancelled')); resolve(false) },
      })
    })
  }

  // ── 核心执行管线 ──

  async function executeQuery(connId: string, database: string | null) {
    const { t } = callbacks
    const fullSql = callbacks.getSelectionSql() || callbacks.getSql()
    if (!fullSql.trim()) return message.warning(t('editor.input_sql_warn'))

    const isSelection = callbacks.getSelectionSql() !== null
    let executionId: number | null = null

    try {
      const preparedStatements = await queryApi.prepareSqlScript(connId, fullSql)
      if (preparedStatements.length === 0) return

      const writeAnalysis = analyzeSqlWrites(preparedStatements.map(s => s.sql))
      if (callbacks.isReadOnly() && writeAnalysis.hasWrites) {
        const warn = t('editor.read_only_blocked', { count: writeAnalysis.writeStatements.length })
        message.warning(warn)
        callbacks.onAddMessage('warning', warn)
        callbacks.onSwitchToResultTab('messages')
        return
      }

      const safetyAnalysis = analyzeSqlSafety(preparedStatements.map(s => s.sql))
      if (!await confirmDangerousExecution(safetyAnalysis.issues)) return

      executionId = beginExecution('query', preparedStatements.length)
      if (isSelection) callbacks.onAddMessage('info', t('editor.executing_selection'))

      // Note: currentDatabaseLabel is handled by caller via callback.onAddMessage
      const processedStatements = preparedStatements.map(s => s.can_page ? `${s.sql} LIMIT 100` : s.sql)
      const response = await queryApi.executeQueryBatch(connId, processedStatements, database, executionId)
      if (isStale(executionId)) return

      const appendedIndex = callbacks.onAppendResults(
        response.results,
        response.results.map((r, i) => {
          const cfg = preparedStatements[i] || preparedStatements[preparedStatements.length - 1]
          return { pagination: { current: 1, pageSize: 100 }, loading: false, hasMore: Boolean(cfg.can_page) && r.rows.length === 100, sql: cfg.sql || '' }
        })
      )

      applyBatchExecutionState(response)
      callbacks.onRevealPanel()
      callbacks.onSwitchToResultTab(response.results.length > 0 ? `result-${appendedIndex}` : 'messages')

      if (!response.error_message && !response.was_cancelled) {
        callbacks.onSaveHistory(fullSql)
      }
    } catch (e: unknown) {
      if (executionId !== null && isStale(executionId)) return
      const errMsg = getErrorMessage(e)
      if (isCancelledMessage(errMsg)) {
        finalizeExecutionState('cancelled', t('editor.summary.query_cancelled'), {
          mode: 'query', statementCount: executionState.value.statementCount,
          completedStatements: executionState.value.completedStatements,
        })
      } else {
        message.error(errMsg)
        finalizeExecutionState('failed', t('editor.summary.query_failed', { failed: 1 }), {
          mode: 'query', detail: errMsg, statementCount: executionState.value.statementCount || 1, completedStatements: 0,
        })
      }
      callbacks.onSwitchToResultTab('messages')
    } finally {
      if (executionId !== null && !isStale(executionId)) executing.value = false
    }
  }

  async function explainQuery(connId: string, database: string | null) {
    const { t } = callbacks
    const sql = callbacks.getSql()
    if (!sql.trim()) return message.warning(t('editor.input_sql_warn'))

    const executionId = beginExecution('explain')
    try {
      const results = await queryApi.explainQuery(connId, sql, database, executionId)
      if (isStale(executionId)) return

      const appendedIndex = callbacks.onAppendResults(
        results,
        results.map(() => ({ pagination: { current: 1, pageSize: 100 }, loading: false, hasMore: false, sql: '' }))
      )
      callbacks.onRevealPanel()
      callbacks.onSwitchToResultTab(`result-${appendedIndex}`)
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
      } else {
        message.error(errMsg)
        finalizeExecutionState('failed', t('editor.summary.explain_failed'), {
          mode: 'explain', detail: errMsg, statementCount: 1, completedStatements: 0,
        })
      }
      callbacks.onSwitchToResultTab('messages')
    } finally {
      if (!isStale(executionId)) executing.value = false
    }
  }

  async function stopExecution(connId: string) {
    const eid = activeExecutionId.value
    const prev = executionState.value
    activeExecutionId.value = executionSeq.value + 1
    executing.value = false
    callbacks.onSwitchToResultTab('messages')

    if (connId && eid > 0) {
      try { await queryApi.cancelQuery(connId, eid) } catch { /* ignore */ }
    }

    finalizeExecutionState('cancelled', callbacks.t('editor.manual_stop'), {
      mode: prev.mode, statementCount: prev.statementCount,
      completedStatements: prev.completedStatements, resultSetCount: prev.resultSetCount,
      affectedRows: prev.affectedRows,
    })
  }

  return {
    executing,
    executionSeq,
    activeExecutionId,
    executionState,
    executionSummaryVisible,
    executionStatusColor,
    showExecutionSummary,
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
