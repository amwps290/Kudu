import { invoke } from '@tauri-apps/api/core'
import type { QueryResult, DbMessage } from '@/types/database'
import { withAutoReconnect } from '@/utils/autoReconnect'

export interface PreparedSqlStatement {
  sql: string
  can_page: boolean
}

export interface QueryBatchExecutionResult {
  results: QueryResult[]
  statements_total: number
  statements_succeeded: number
  failed_statement_index: number | null
  error_message: string | null
  was_cancelled: boolean
  execution_time_ms: number
  messages: DbMessage[]
}

export const queryApi = {
  /**
   * 执行 SQL 查询
   */
  async executeQuery(
    connectionId: string, 
    sql: string, 
    database?: string | null,
    queryId?: number | null,
    options?: { allowReconnectRetry?: boolean }
  ): Promise<QueryResult[]> {
    return withAutoReconnect(connectionId, () => invoke<QueryResult[]>('execute_query', { 
      connectionId, 
      sql, 
      database: database || null,
      queryId: queryId ?? null,
    }), options?.allowReconnectRetry ?? false)
  },

  /**
   * 解释 SQL 查询 (EXPLAIN)
   */
  async explainQuery(
    connectionId: string, 
    sql: string, 
    database?: string | null,
    queryId?: number | null,
    options?: { allowReconnectRetry?: boolean }
  ): Promise<QueryResult[]> {
    return withAutoReconnect(connectionId, () => invoke<QueryResult[]>('explain_query', { 
      connectionId, 
      sql, 
      database: database || null,
      queryId: queryId ?? null,
    }), options?.allowReconnectRetry ?? false)
  },

  /**
   * 批量执行 SQL
   */
  async executeQueryBatch(
    connectionId: string,
    sqls: string[],
    database?: string | null,
    queryId?: number | null,
    options?: { allowReconnectRetry?: boolean }
  ): Promise<QueryBatchExecutionResult> {
    return withAutoReconnect(connectionId, () => invoke<QueryBatchExecutionResult>('execute_query_batch', {
      connectionId,
      sqls,
      database: database || null,
      queryId: queryId ?? null,
    }), options?.allowReconnectRetry ?? false)
  },

  /**
   * 取消正在执行的 SQL
   */
  async cancelQuery(
    connectionId: string,
    queryId: number
  ): Promise<boolean> {
    return invoke<boolean>('cancel_query', {
      connectionId,
      queryId,
    })
  },

  /**
   * 让后端按数据库方言解析 SQL 脚本
   */
  async prepareSqlScript(
    connectionId: string,
    sql: string,
    options?: { allowReconnectRetry?: boolean }
  ): Promise<PreparedSqlStatement[]> {
    return withAutoReconnect(connectionId, () => invoke<PreparedSqlStatement[]>('prepare_sql_script', { connectionId, sql }), options?.allowReconnectRetry ?? false)
  },

  /**
   * 格式化/美化 SQL
   */
  async beautifySql(connectionId: string, sql: string, options?: { allowReconnectRetry?: boolean }): Promise<string> {
    return withAutoReconnect(connectionId, () => invoke<string>('beautify_sql', { connectionId, sql }), options?.allowReconnectRetry ?? false)
  },

  /**
   * 更新表数据 (参数化)
   */
  async updateTableData(params: {
    connectionId: string,
    database: string,
    table: string,
    schema?: string | null,
    column: string,
    value: string | null,
    whereConditions: Record<string, any>
  }): Promise<void> {
    return invoke('update_table_data', params)
  },

  /**
   * 删除表数据 (参数化)
   */
  async deleteTableData(params: {
    connectionId: string,
    database: string,
    table: string,
    schema?: string | null,
    whereConditions: Record<string, any>
  }): Promise<void> {
    return invoke('delete_table_data', params)
  },

  /**
   * 变更表结构
   */
  async alterTableStructure(params: {
    connectionId: string,
    database: string,
    table: string,
    schema?: string | null,
    changes: Array<{ type: string, data: any }>
  }): Promise<void> {
    return invoke('alter_table_structure', params)
  }
}
