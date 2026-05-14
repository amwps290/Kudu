import { invoke } from '@tauri-apps/api/core'
import type { DatabaseType } from '@/types/database'
import { loadMonaco, type MonacoModule } from '@/utils/monacoLoader'

export interface AutoCompleteData {
  databases: string[]
  tables: TableSuggestion[]
  functions: FunctionSuggestion[]
  keywords: string[]
}

export interface TableSuggestion {
  name: string
  schema?: string
  database: string
  table_type?: string
  columns: ColumnSuggestion[]
}

export interface FunctionSuggestion {
  name: string
  schema?: string
  database: string
  return_type?: string
  arguments?: string
  function_type?: string
}

export interface ColumnSuggestion {
  name: string
  data_type: string
}

interface ModelContext {
  connectionId: string
  database: string | null
  dbType: DatabaseType | null
}

interface QuerySource {
  schema?: string
  table: string
  alias?: string
}

const FALLBACK_SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'ALTER', 'DROP', 'TABLE', 'VIEW', 'INDEX', 'DATABASE', 'SCHEMA',
  'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'GROUP', 'BY', 'ORDER', 'HAVING',
  'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'AS', 'AND', 'OR', 'NOT', 'NULL',
  'IS', 'IN', 'EXISTS', 'LIKE', 'BETWEEN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'
]

export class SqlAutocompleteManager {
  private static instance: SqlAutocompleteManager
  private static registrationPromise: Promise<SqlAutocompleteManager> | null = null

  private monaco: MonacoModule | null = null
  private registered = false
  private contextMap = new Map<string, ModelContext>()
  private dataCache = new Map<string, AutoCompleteData>()
  private loadingMap = new Map<string, Promise<AutoCompleteData>>()
  public readonly triggerCharacters = [' ', '.', '(', ',']

  private gucParameters: Set<string>

  private constructor() {
    this.gucParameters = new Set([
      'search_path', 'client_encoding', 'timezone', 'datestyle', 'intervalstyle',
      'extra_float_digits', 'bytea_output', 'xmlbinary', 'xmloption',
      'work_mem', 'maintenance_work_mem', 'hash_mem_multiplier',
      'shared_buffers', 'effective_cache_size', 'wal_buffers', 'temp_buffers',
      'max_parallel_workers', 'max_parallel_workers_per_gather',
      'max_parallel_maintenance_workers', 'parallel_leader_participation',
      'random_page_cost', 'seq_page_cost', 'effective_io_concurrency',
      'cpu_tuple_cost', 'cpu_index_tuple_cost', 'cpu_operator_cost',
      'jit', 'jit_above_cost', 'jit_inline_above_cost', 'jit_optimize_above_cost',
      'statement_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout',
      'idle_session_timeout', 'tcp_keepalives_idle', 'tcp_keepalives_interval',
      'tcp_keepalives_count', 'tcp_user_timeout',
      'default_transaction_isolation', 'default_transaction_read_only',
      'default_transaction_deferrable', 'transaction_isolation',
      'transaction_read_only', 'transaction_deferrable',
      'enable_seqscan', 'enable_indexscan', 'enable_indexonlyscan',
      'enable_bitmapscan', 'enable_tidscan', 'enable_hashjoin',
      'enable_mergejoin', 'enable_nestloop', 'enable_material',
      'enable_partition_pruning', 'enable_partitionwise_join',
      'enable_partitionwise_aggregate', 'enable_async_append',
      'enable_gathermerge', 'enable_memoize', 'enable_incremental_sort',
      'constraint_exclusion', 'cursor_tuple_fraction',
      'from_collapse_limit', 'join_collapse_limit', 'geqo',
      'geqo_threshold', 'geqo_effort', 'geqo_pool_size',
      'geqo_generations', 'geqo_selection_bias', 'geqo_seed',
      'standard_conforming_strings', 'escape_string_warning',
      'synchronize_seqscans', 'vacuum_cost_delay', 'vacuum_cost_limit',
      'autovacuum', 'autovacuum_vacuum_threshold', 'autovacuum_analyze_threshold',
      'autovacuum_vacuum_scale_factor', 'autovacuum_analyze_scale_factor',
      'autovacuum_vacuum_cost_delay', 'autovacuum_vacuum_cost_limit',
      'autovacuum_freeze_max_age', 'autovacuum_multixact_freeze_max_age',
      'log_statement', 'log_min_duration_statement', 'log_duration',
      'log_connections', 'log_disconnections', 'log_destination',
      'log_line_prefix', 'log_timezone', 'log_checkpoints',
      'log_lock_waits', 'log_temp_files', 'log_autovacuum_min_duration',
      'default_tablespace', 'temp_tablespaces', 'temp_file_limit',
      'application_name', 'client_min_messages', 'log_min_messages',
      'DateStyle', 'IntervalStyle', 'TimeZone', 'lc_messages', 'lc_monetary',
      'lc_numeric', 'lc_time', 'default_text_search_config',
      'array_nulls', 'backslash_quote', 'transform_null_equals',
      'row_security', 'check_function_bodies', 'default_table_access_method',
      'password_encryption', 'ssl', 'ssl_ca_file', 'ssl_cert_file',
      'ssl_key_file', 'ssl_crl_file', 'ssl_min_protocol_version',
      'wal_level', 'fsync', 'synchronous_commit', 'wal_sync_method',
      'full_page_writes', 'wal_log_hints', 'wal_compression',
      'wal_init_zero', 'wal_recycle', 'commit_delay', 'commit_siblings',
      'checkpoint_timeout', 'checkpoint_completion_target',
      'max_wal_size', 'min_wal_size', 'archive_mode', 'archive_command',
      'archive_timeout', 'restore_command', 'recovery_target_timeline',
      'max_connections', 'superuser_reserved_connections',
      'max_wal_senders', 'max_replication_slots',
      'track_activities', 'track_counts', 'track_io_timing',
      'track_functions', 'track_wal_io_timing', 'track_commit_timestamp',
    ])
  }

  private async ensureRegistered() {
    if (this.registered) return

    this.monaco = await loadMonaco()
    this.monaco.languages.registerCompletionItemProvider('sql', this)
    this.registered = true
  }

  public static async getInstance(): Promise<SqlAutocompleteManager> {
    if (!SqlAutocompleteManager.instance) {
      SqlAutocompleteManager.instance = new SqlAutocompleteManager()
    }
    await SqlAutocompleteManager.instance.ensureRegistered()
    return SqlAutocompleteManager.instance
  }

  public static getOrCreate(): Promise<SqlAutocompleteManager> {
    if (!SqlAutocompleteManager.registrationPromise) {
      SqlAutocompleteManager.registrationPromise = SqlAutocompleteManager.getInstance()
    }
    return SqlAutocompleteManager.registrationPromise
  }

  public bindModel(model: any, context: ModelContext) {
    this.contextMap.set(model.id, context)
    void this.fetchData(context.connectionId, context.database)
  }

  public unbindModel(model: any) {
    this.contextMap.delete(model.id)
  }

  private async fetchData(connectionId: string, database: string | null): Promise<AutoCompleteData | null> {
    const cacheKey = `${connectionId}:${database || ''}`

    if (this.dataCache.has(cacheKey)) {
      return this.dataCache.get(cacheKey)!
    }

    if (this.loadingMap.has(cacheKey)) {
      return this.loadingMap.get(cacheKey)!
    }

    const promise = (async () => {
      try {
        const data = await invoke<AutoCompleteData>('get_autocomplete_data', {
          connectionId,
          database,
        })
        this.dataCache.set(cacheKey, data)
        return data
      } catch (error) {
        console.error('加载补全数据失败:', error)
        throw error
      } finally {
        this.loadingMap.delete(cacheKey)
      }
    })()

    this.loadingMap.set(cacheKey, promise)
    return promise
  }

  private quoteIdentifier(name: string, dbType: DatabaseType | null): string {
    if (dbType === 'postgresql') {
      if (/[A-Z]/.test(name) || /[^a-z0-9_]/.test(name)) {
        return `"${name}"`
      }
    }
    return name
  }

  private generateFunctionSnippet(name: string, args: string | undefined): string {
    if (!args || args.trim() === '' || args.trim() === '()') {
      return `${name}($0)`
    }

    const cleanArgs = args.replace(/^\(|\)$/g, '').trim()
    if (!cleanArgs) return `${name}($0)`

    const argList = cleanArgs.split(',').map(s => s.trim())
    const placeholders = argList.map((arg, index) => {
      const parts = arg.split(/\s+/)
      let paramName = parts[0]

      if (['IN', 'OUT', 'INOUT', 'VARIADIC'].includes(paramName.toUpperCase()) && parts.length > 1) {
        paramName = parts[1]
      }

      if (paramName.toLowerCase() === 'integer' || paramName.toLowerCase() === 'text' || /[^a-zA-Z0-9_]/.test(paramName)) {
        paramName = `param${index + 1}`
      }

      return `\${${index + 1}:${paramName}}`
    })

    return `${name}(${placeholders.join(', ')})$0`
  }

  private isTableLikeFunction(func: FunctionSuggestion, dbType: DatabaseType | null): boolean {
    if (dbType !== 'postgresql') return false
    const returnType = (func.return_type || '').toUpperCase()
    return returnType.includes('SETOF') || returnType.startsWith('TABLE(')
  }

  private normalizeIdentifier(identifier: string): string {
    return identifier.replace(/^["`]|["`]$/g, '')
  }

  private parseQuerySources(sql: string): QuerySource[] {
    const sources: QuerySource[] = []
    const sourceRegex = /(?:FROM|JOIN|UPDATE|INTO)\s+((?:"[^"]+"|`[^`]+`|[a-zA-Z0-9_]+)(?:\.(?:"[^"]+"|`[^`]+`|[a-zA-Z0-9_]+))?)(?:\s+(?:AS\s+)?([a-zA-Z_][\w$]*))?/gi
    let match: RegExpExecArray | null

    while ((match = sourceRegex.exec(sql)) !== null) {
      const rawName = match[1]
      const alias = match[2]
      const parts = rawName.split('.').map(part => this.normalizeIdentifier(part))
      const [schema, table] = parts.length > 1 ? [parts[0], parts[1]] : [undefined, parts[0]]

      if (!table) continue

      sources.push({
        schema,
        table,
        alias: alias ? this.normalizeIdentifier(alias) : undefined,
      })
    }

    return sources
  }

  private getQualifier(textUntilPosition: string): string | null {
    const match = textUntilPosition.match(/((?:"[^"]+"|`[^`]+`|[a-zA-Z0-9_]+))\.$/)
    return match ? this.normalizeIdentifier(match[1]) : null
  }

  private findTablesForSources(tables: TableSuggestion[], sources: QuerySource[]): Array<QuerySource & { tableDef: TableSuggestion }> {
    return sources.flatMap((source) => {
      return tables
        .filter((table) => {
          const tableNameMatches = this.normalizeIdentifier(table.name).toLowerCase() === source.table.toLowerCase()
          const schemaMatches = !source.schema || this.normalizeIdentifier(table.schema || '').toLowerCase() === source.schema.toLowerCase()
          return tableNameMatches && schemaMatches
        })
        .map((tableDef) => ({ ...source, tableDef }))
    })
  }

  private buildKeywordSuggestions(position: any, model: any, keywords: string[]) {
    if (!this.monaco) return []

    const word = model.getWordUntilPosition(position)
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    }

    return keywords.map((keyword) => ({
      label: keyword,
      kind: this.monaco!.languages.CompletionItemKind.Keyword,
      insertText: keyword,
      range,
    }))
  }

  async provideCompletionItems(
    model: any,
    position: any
  ): Promise<any> {
    if (!this.monaco) return { suggestions: [] }

    const context = this.contextMap.get(model.id)
    if (!context) {
      return { suggestions: this.buildKeywordSuggestions(position, model, FALLBACK_SQL_KEYWORDS) }
    }

    const data = await this.fetchData(context.connectionId, context.database).catch(() => null)
    if (!data) {
      return { suggestions: this.buildKeywordSuggestions(position, model, FALLBACK_SQL_KEYWORDS) }
    }

    const suggestions: any[] = []
    const word = model.getWordUntilPosition(position)
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    }

    const textUntilPosition = model.getValueInRange({
      startLineNumber: position.lineNumber,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    })
    const tokens = textUntilPosition.trim().split(/\s+/)
    const lastToken = tokens[tokens.length - 1]?.toUpperCase() || ''
    const querySources = this.parseQuerySources(model.getValue())
    const sourceTables = this.findTablesForSources(data.tables, querySources)
    const qualifier = this.getQualifier(textUntilPosition)

    for (const keyword of data.keywords) {
      suggestions.push({
        label: keyword,
        kind: this.monaco.languages.CompletionItemKind.Keyword,
        insertText: keyword,
        range,
      })
    }

    for (const database of data.databases) {
      suggestions.push({
        label: database,
        kind: this.monaco.languages.CompletionItemKind.Value,
        insertText: this.quoteIdentifier(database, context.dbType),
        range,
      })
    }

    for (const table of data.tables) {
      if (qualifier) {
        const qualifierMatchesSchema = this.normalizeIdentifier(table.schema || '').toLowerCase() === qualifier.toLowerCase()
        const qualifierMatchesDatabase = this.normalizeIdentifier(table.database || '').toLowerCase() === qualifier.toLowerCase()
        const qualifierMatchesAlias = sourceTables.some(source => source.alias?.toLowerCase() === qualifier.toLowerCase() && source.tableDef.name === table.name)
        if (!qualifierMatchesSchema && !qualifierMatchesDatabase && !qualifierMatchesAlias) continue
      }

      suggestions.push({
        label: table.name,
        kind: table.table_type === 'VIEW'
          ? this.monaco.languages.CompletionItemKind.Interface
          : this.monaco.languages.CompletionItemKind.Class,
        detail: [table.database, table.schema].filter(Boolean).join('.'),
        insertText: this.quoteIdentifier(table.name, context.dbType),
        range,
      })
    }

    for (const func of data.functions) {
      if (qualifier) {
        const qualifierMatchesSchema = this.normalizeIdentifier(func.schema || '').toLowerCase() === qualifier.toLowerCase()
        const qualifierMatchesDatabase = this.normalizeIdentifier(func.database || '').toLowerCase() === qualifier.toLowerCase()
        if (!qualifierMatchesSchema && !qualifierMatchesDatabase) continue
      }

      suggestions.push({
        label: func.name,
        kind: this.monaco.languages.CompletionItemKind.Function,
        detail: func.return_type || func.function_type || '',
        insertText: this.generateFunctionSnippet(func.name, func.arguments),
        insertTextRules: this.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
      })
    }

    const shouldSuggestColumns = qualifier || ['SELECT', 'WHERE', 'AND', 'OR', 'ON', 'SET', 'ORDER', 'GROUP', 'BY', ','].includes(lastToken)
    if (shouldSuggestColumns) {
      for (const source of sourceTables) {
        if (qualifier && source.alias?.toLowerCase() !== qualifier.toLowerCase() && source.tableDef.name.toLowerCase() !== qualifier.toLowerCase()) {
          continue
        }

        for (const column of source.tableDef.columns) {
          suggestions.push({
            label: column.name,
            kind: this.monaco.languages.CompletionItemKind.Field,
            detail: `${source.tableDef.name}.${column.data_type}`,
            insertText: this.quoteIdentifier(column.name, context.dbType),
            range,
          })
        }
      }
    }

    const shouldSuggestSetParameters = context.dbType === 'postgresql' && /\bSET\s+$/i.test(textUntilPosition)
    if (shouldSuggestSetParameters) {
      for (const guc of this.gucParameters) {
        suggestions.push({
          label: guc,
          kind: this.monaco.languages.CompletionItemKind.Function,
          insertText: guc,
          insertTextRules: this.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        })
      }
    }

    const shouldSuggestFromFunctions = context.dbType === 'postgresql' && /\b(FROM|JOIN)\s+$/i.test(textUntilPosition)
    if (shouldSuggestFromFunctions) {
      for (const func of data.functions.filter(func => this.isTableLikeFunction(func, context.dbType))) {
        suggestions.push({
          label: func.name,
          kind: this.monaco.languages.CompletionItemKind.Function,
          detail: func.return_type || func.function_type || '',
          insertText: this.generateFunctionSnippet(func.name, func.arguments),
          insertTextRules: this.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        })
      }
    }

    return { suggestions }
  }

  public clearCache(connectionId?: string) {
    if (!connectionId) {
      this.dataCache.clear()
    } else {
      for (const key of this.dataCache.keys()) {
        if (key.startsWith(`${connectionId}:`)) {
          this.dataCache.delete(key)
        }
      }
    }
  }

}

export function getSqlAutocompleteManager(): Promise<SqlAutocompleteManager> {
  return SqlAutocompleteManager.getOrCreate()
}
