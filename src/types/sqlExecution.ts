export type SqlExecutionStatus = 'idle' | 'running' | 'success' | 'failed' | 'cancelled' | 'partial_success'

export type SqlExecutionMode = 'query' | 'explain'

export interface SqlExecutionState {
  status: SqlExecutionStatus
  mode: SqlExecutionMode | null
  summary: string
  detail: string
  statementCount: number
  completedStatements: number
  resultSetCount: number
  affectedRows: number
  startedAt: number | null
  elapsedMs: number
  updatedAt: number
}

export function createIdleExecutionState(): SqlExecutionState {
  return {
    status: 'idle',
    mode: null,
    summary: '',
    detail: '',
    statementCount: 0,
    completedStatements: 0,
    resultSetCount: 0,
    affectedRows: 0,
    startedAt: null,
    elapsedMs: 0,
    updatedAt: Date.now(),
  }
}
