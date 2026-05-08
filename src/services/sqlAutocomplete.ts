/**
 * SQL 自动补全服务 (重构版)
 * 实现全局单例、模型感知、智能缓存
 */

import * as monaco from 'monaco-editor'
import { invoke } from '@tauri-apps/api/core'
import type { DatabaseType } from '@/types/database'

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

/**
 * 全局 SQL 自动补全管理器
 */
export class SqlAutocompleteManager implements monaco.languages.CompletionItemProvider, monaco.languages.InlayHintsProvider {
  private static instance: SqlAutocompleteManager
  private contextMap = new Map<string, ModelContext>() // modelId -> context
  private dataCache = new Map<string, AutoCompleteData>() // "connId:db" -> data
  private loadingMap = new Map<string, Promise<AutoCompleteData>>() // 防止重复请求
  public readonly triggerCharacters = [' ', '.', '(', ',']

  private gucParameters: Set<string>
  private inlayHintsEmitter = new monaco.Emitter<void>()
  public onDidChangeInlayHints = this.inlayHintsEmitter.event

  private constructor() {
    // GUC 参数 (PostgreSQL)
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
    // 注册到 Monaco
    monaco.languages.registerCompletionItemProvider('sql', this)
    monaco.languages.registerInlayHintsProvider('sql', this)
  }

  public static getInstance(): SqlAutocompleteManager {
    if (!SqlAutocompleteManager.instance) {
      SqlAutocompleteManager.instance = new SqlAutocompleteManager()
    }
    return SqlAutocompleteManager.instance
  }

  /**
   * 为模型绑定上下文
   */
  public bindModel(model: monaco.editor.ITextModel, context: ModelContext) {
    this.contextMap.set(model.id, context)
    // 预加载数据
    this.fetchData(context.connectionId, context.database).then(() => {
      this.inlayHintsEmitter.fire()
    })
  }

  /**
   * 解绑模型
   */
  public unbindModel(model: monaco.editor.ITextModel) {
    this.contextMap.delete(model.id)
  }

  /**
   * 获取/刷新数据
   */
  private async fetchData(connectionId: string, database: string | null): Promise<AutoCompleteData | null> {
    const cacheKey = `${connectionId}:${database || ''}`
    
    // 如果已有缓存，直接返回
    if (this.dataCache.has(cacheKey)) {
      return this.dataCache.get(cacheKey)!
    }

    // 如果正在加载，等待
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
        this.inlayHintsEmitter.fire()
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

  /**
   * 将函数参数字符串转换为 Monaco Snippet 格式
   * 例如: "id integer, name text" -> "(${1:id}, ${2:name})"
   */
  private generateFunctionSnippet(name: string, args: string | undefined): string {
    if (!args || args.trim() === '' || args.trim() === '()') {
      return `${name}($0)`
    }

    // 移除外层括号并按逗号分割
    const cleanArgs = args.replace(/^\(|\)$/g, '').trim()
    if (!cleanArgs) return `${name}($0)`

    const argList = cleanArgs.split(',').map(s => s.trim())
    const placeholders = argList.map((arg, index) => {
      // 尝试提取参数名 (通常是第一个单词)
      // 处理 "name type", "IN name type", 或者只有 "type" 的情况
      const parts = arg.split(/\s+/)
      let paramName = parts[0]
      
      // 如果第一个单词是 IN/OUT/INOUT，取第二个
      if (['IN', 'OUT', 'INOUT', 'VARIADIC'].includes(paramName.toUpperCase()) && parts.length > 1) {
        paramName = parts[1]
      }

      // 如果提取出的参数名看起来像类型名，或者包含特殊字符，使用通用占位符
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

  /**
   * Monaco 补全核心回调
   */
  async provideCompletionItems(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): Promise<monaco.languages.CompletionList> {
    const context = this.contextMap.get(model.id)
    if (!context) return { suggestions: [] }

    const data = await this.fetchData(context.connectionId, context.database).catch(() => null)
    if (!data) return { suggestions: [] }

    const suggestions: monaco.languages.CompletionItem[] = []
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

    // 1. 关键字
    for (const keyword of data.keywords) {
      suggestions.push({
        label: keyword,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: keyword,
        range,
        sortText: `0_${keyword}`,
      })
    }

    // 1.5 GUC 参数 (SET/SHOW/RESET 上下文)
    const isGucContext = /(?:SET|SHOW|RESET)\s+[A-Za-z0-9_.]*$/i.test(textUntilPosition.trim())
    if (isGucContext && context.dbType === 'postgresql') {
      for (const param of this.gucParameters) {
        suggestions.push({
          label: param,
          kind: monaco.languages.CompletionItemKind.Value,
          insertText: param,
          range,
          sortText: `0_guc_${param}`,
        })
      }
    }

    // 2. 数据库
    const isDbContext = lastToken === 'USE' || lastToken === 'DATABASE'
    if (isDbContext) {
      for (const db of data.databases) {
        suggestions.push({
          label: db,
          kind: monaco.languages.CompletionItemKind.Module,
          insertText: this.quoteIdentifier(db, context.dbType),
          range,
          sortText: `1_${db}`,
        })
      }
    }

    // 3. 表建议
    const isTableContext = /(?:FROM|JOIN|UPDATE|INTO|TABLE)\s*$/i.test(textUntilPosition) || /(?:FROM|JOIN|UPDATE|INTO|TABLE)\s+[\w"`.\-]*$/i.test(textUntilPosition)
    if (isTableContext) {
      const schemaFilter = qualifier && !sourceTables.some(source => source.alias?.toLowerCase() === qualifier.toLowerCase())
        ? qualifier.toLowerCase()
        : null

      for (const table of data.tables) {
        if (schemaFilter && (table.schema || '').toLowerCase() !== schemaFilter) continue

        const quotedName = this.quoteIdentifier(table.name, context.dbType)
        const quotedSchema = table.schema ? this.quoteIdentifier(table.schema, context.dbType) : ''
        
        let label = table.name
        if (table.schema && table.schema !== 'public') label = `${table.schema}.${table.name}`
        
        let insertText = quotedName
        if (quotedSchema) insertText = `${quotedSchema}.${quotedName}`

        suggestions.push({
          label,
          kind: table.table_type?.toUpperCase() === 'VIEW'
            ? monaco.languages.CompletionItemKind.Interface
            : monaco.languages.CompletionItemKind.Class,
          detail: `${table.table_type?.toUpperCase() === 'VIEW' ? '视图' : '表'} (${table.schema || 'public'})`,
          insertText,
          range,
          sortText: `2_${label}`,
        })
      }

      for (const func of data.functions) {
        if (!this.isTableLikeFunction(func, context.dbType)) continue
        if (schemaFilter && (func.schema || '').toLowerCase() !== schemaFilter) continue

        const quotedName = this.quoteIdentifier(func.name, context.dbType)
        const quotedSchema = func.schema ? this.quoteIdentifier(func.schema, context.dbType) : ''
        const functionNameWithSchema = quotedSchema ? `${quotedSchema}.${quotedName}` : quotedName
        const signature = func.arguments?.startsWith('(')
          ? func.arguments
          : `(${func.arguments || ''})`

        suggestions.push({
          label: `${func.schema ? `${func.schema}.` : ''}${func.name}${signature}`,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: `表函数 (${func.return_type || 'record'})`,
          insertText: this.generateFunctionSnippet(functionNameWithSchema, func.arguments),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          sortText: `3_${func.name}`,
        })
      }
    }

    // 4. 列建议
    const isColContext = !isTableContext && (lastToken === 'SELECT' || lastToken === 'WHERE' || lastToken === 'SET' || lastToken === ',')
    if (isColContext) {
      const relevantSources = qualifier
        ? sourceTables.filter(source =>
            source.alias?.toLowerCase() === qualifier.toLowerCase() ||
            source.table.toLowerCase() === qualifier.toLowerCase()
          )
        : sourceTables

      const effectiveSources = relevantSources.length > 0
        ? relevantSources
        : data.tables.map((tableDef) => ({
            table: this.normalizeIdentifier(tableDef.name),
            schema: tableDef.schema ? this.normalizeIdentifier(tableDef.schema) : undefined,
            alias: undefined,
            tableDef,
          }))

      for (const source of effectiveSources) {
        for (const column of source.tableDef.columns) {
          const quotedCol = this.quoteIdentifier(column.name, context.dbType)
          const qualifierName = source.alias || source.table
          const shouldPrefix = !qualifier && effectiveSources.length > 1
          const label = qualifier ? column.name : shouldPrefix ? `${qualifierName}.${column.name}` : column.name
          const insertText = qualifier
            ? quotedCol
            : shouldPrefix
              ? `${this.quoteIdentifier(qualifierName, context.dbType)}.${quotedCol}`
              : quotedCol

          suggestions.push({
            label,
            kind: monaco.languages.CompletionItemKind.Field,
            detail: `${column.data_type} (${qualifierName})`,
            insertText,
            range,
            sortText: `4_${label}`,
          })
        }
      }
    }

    // 5. 函数建议
    const isFuncContext = !isTableContext && (lastToken === 'SELECT' || lastToken === '(' || lastToken === ',' || /\bSELECT\s+[\w",.\s]*$/i.test(textUntilPosition))
    if (isFuncContext) {
      for (const func of data.functions) {
        if (this.isTableLikeFunction(func, context.dbType)) continue

        const quotedName = this.quoteIdentifier(func.name, context.dbType)
        const quotedSchema = func.schema ? this.quoteIdentifier(func.schema, context.dbType) : ''
        
        // 格式化参数签名，如果参数带括号就原样使用，否则补齐
        const args = func.arguments || ''
        const signature = args.startsWith('(') ? args : `(${args})`

        // 构造 label 对象：主标签是函数名(参数)，辅助标签是返回类型
        const labelObj = {
          label: func.name + signature,
          description: func.return_type || 'void',
          detail: func.schema ? ` [${func.schema}]` : ''
        }

        // 生成带参数占位符的 Snippet
        const functionNameWithSchema = quotedSchema ? `${quotedSchema}.${quotedName}` : quotedName
        const insertText = this.generateFunctionSnippet(functionNameWithSchema, func.arguments)

        suggestions.push({
          label: labelObj,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: `${func.function_type === 'aggregate' ? '聚合函数' : '函数'}: ${func.schema ? func.schema + '.' : ''}${func.name}${signature}`,
          documentation: {
            value: `### ${func.name}\n\n**签名:** \`${signature}\`\n\n**返回:** \`${func.return_type || 'void'}\`\n\n**路径:** \`${func.database}.${func.schema || 'public'}\``,
            isTrusted: true
          },
          insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          sortText: `5_${func.name}`,
        })

      }

      // 通用内置函数 (如果没有拉取到)
      if (data.functions.length < 10) {
        const builtInFuncs = [
          { name: 'COUNT', detail: '计数', snippet: 'COUNT($0)' },
          { name: 'SUM', detail: '求和', snippet: 'SUM($0)' },
          { name: 'AVG', detail: '平均值', snippet: 'AVG($0)' },
          { name: 'MAX', detail: '最大值', snippet: 'MAX($0)' },
          { name: 'MIN', detail: '最小值', snippet: 'MIN($0)' },
          { name: 'COALESCE', detail: '返回第一个非空值', snippet: 'COALESCE($1, $2)' },
          { name: 'NOW', detail: '当前时间', snippet: 'NOW()' },
        ]
        for (const f of builtInFuncs) {
          suggestions.push({
            label: f.name,
            kind: monaco.languages.CompletionItemKind.Function,
            detail: `内置函数: ${f.detail}`,
            insertText: f.snippet,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            sortText: `6_${f.name}`,
          })
        }
      }
    }

    return { suggestions }
  }

  /**
   * 清理特定连接的所有缓存 (例如连接关闭时)
   */
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

  /**
   * InlayHints: 函数参数提示
   */
  async provideInlayHints(
    model: monaco.editor.ITextModel,
    range: monaco.Range,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.InlayHintList> {
    const context = this.contextMap.get(model.id)
    const hints: monaco.languages.InlayHint[] = []
    if (!context) return { hints, dispose: () => {} }

    const data = await this.fetchData(context.connectionId, context.database).catch(() => null)
    if (!data) return { hints, dispose: () => {} }

    const text = model.getValue()
    
    // 使用栈跟踪括号嵌套，找到每个函数调用及其参数位置
    const funcCallRegex = /(?:(\w+)\.)?(\w+)\s*\(/g
    let match: RegExpExecArray | null

    while ((match = funcCallRegex.exec(text)) !== null) {
      if (token.isCancellationRequested) break

      const schema = match[1] || undefined
      const funcName = match[2]
      const openParenOffset = match.index + match[0].length - 1
      const openParenPos = model.getPositionAt(openParenOffset)
      if (openParenPos.lineNumber < range.startLineNumber || openParenPos.lineNumber > range.endLineNumber) continue

      // 找匹配的右括号
      let depth = 0
      let closeParenOffset = -1
      for (let i = openParenOffset; i < text.length; i++) {
        if (text[i] === '(') depth++
        else if (text[i] === ')') { depth--; if (depth === 0) { closeParenOffset = i; break; } }
      }
      if (closeParenOffset < 0) continue

      // 找参数分隔的逗号位置 (只统计 depth===1 的逗号)
      const commaPositions: number[] = []
      depth = 0
      for (let i = openParenOffset; i < closeParenOffset; i++) {
        if (text[i] === '(') depth++
        else if (text[i] === ')') depth--
        else if (text[i] === ',' && depth === 1) commaPositions.push(i)
      }

      // 查找匹配的函数
      const func = data.functions.find(f => {
        const nameMatch = f.name.toLowerCase() === funcName.toLowerCase()
        if (!schema) return nameMatch
        return nameMatch && (f.schema || '').toLowerCase() === schema.toLowerCase()
      })

      if (!func || !func.arguments) continue
      const args = func.arguments.replace(/^\(|\)$/g, '').trim()
      if (!args) continue

      // 解析参数名
      const argParts = args.split(',').map(a => {
        const parts = a.trim().split(/\s+/)
        let nameIdx = 0
        if (['IN', 'OUT', 'INOUT', 'VARIADIC'].includes(parts[0]?.toUpperCase())) nameIdx = 1
        return parts[nameIdx] || 'arg'
      })

      // 如果有参数但括号内为空(没有逗号)，在 ( 后放置第一个参数提示
      if (commaPositions.length === 0 && argParts.length > 0) {
        const hintPos = model.getPositionAt(openParenOffset + 1)
        hints.push({
          label: `${argParts[0]}:`,
          position: { lineNumber: hintPos.lineNumber, column: hintPos.column },
          kind: monaco.languages.InlayHintKind.Parameter,
          paddingLeft: true,
          paddingRight: true,
        })
      }

      // 在每个逗号后放置下一个参数提示
      for (let i = 0; i < commaPositions.length && i < argParts.length - 1; i++) {
        const commaPos = model.getPositionAt(commaPositions[i] + 1) // 逗号后
        hints.push({
          label: `${argParts[i + 1]}:`,
          position: { lineNumber: commaPos.lineNumber, column: commaPos.column },
          kind: monaco.languages.InlayHintKind.Parameter,
          paddingLeft: true,
          paddingRight: true,
        })
      }
    }

    return { hints, dispose: () => {} }
  }
}

/**
 * 外部调用的单例获取函数
 */
export function getSqlAutocompleteManager(): SqlAutocompleteManager {
  return SqlAutocompleteManager.getInstance()
}
