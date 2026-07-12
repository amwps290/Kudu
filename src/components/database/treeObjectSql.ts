import type { TreeNode } from './treeModel'

/**
 * 树对象操作的 SQL 拼接纯函数（Slice 15 子批②起；对等 Vue 版 DatabaseTree 内散落的
 * quoteIdent/formatColumnDefinition/formatObjectDefinition/buildRoutine* 等）。
 * ⚠️ 前端拼 SQL 的注入面是已知业务问题 1，保持原行为迁移、不顺手修。
 */

function metaStr(node: TreeNode, key: string): string {
  return String((node.metadata as Record<string, unknown>)?.[key] || '')
}

/** 标识符引用（按方言：PG 系/SQLite 双引号，其余反引号；dbType 用原始 props 值，照抄 Vue） */
export function quoteIdentFor(dbType: string | undefined, name: string): string {
  const type = dbType || 'mysql'
  if (type === 'sqlite' || type === 'postgresql' || type === 'opengauss' || type === 'gaussdb') {
    return `"${name.replace(/"/g, '""')}"`
  }
  return `\`${name.replace(/`/g, '``')}\``
}

/** 表/视图 CRUD 模板（对等 handleGenerateSql 的 switch 段） */
export function buildTableCrudSql(
  type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
  fullName: string,
  colNames: string[],
  quote: (name: string) => string,
): string {
  const colList = colNames.length ? colNames.map((c) => quote(c)).join(', ') : '*'
  switch (type) {
    case 'SELECT':
      return `SELECT ${colList}\nFROM ${fullName}\nWHERE /* condition */;`
    case 'INSERT':
      return `INSERT INTO ${fullName} (${colList})\nVALUES (${colNames.map(() => '/* value */').join(', ')});`
    case 'UPDATE':
      return `UPDATE ${fullName}\nSET ${colNames.map((c) => `${quote(c)} = /* value */`).join(',\n    ')}\nWHERE /* condition */;`
    case 'DELETE':
      return `DELETE FROM ${fullName}\nWHERE /* condition */;`
  }
}

export function formatColumnDefinition(node: TreeNode): string {
  const parts = [metaStr(node, 'name'), metaStr(node, 'data_type')]
  if (!node.metadata?.nullable) parts.push('NOT NULL')
  if (node.metadata?.default_value !== undefined && node.metadata?.default_value !== null && String(node.metadata.default_value) !== '') {
    parts.push(`DEFAULT ${String(node.metadata.default_value)}`)
  }
  if (node.metadata?.is_primary_key) parts.push('PRIMARY KEY')
  if (node.metadata?.is_auto_increment) parts.push('AUTO_INCREMENT')
  if (node.metadata?.comment) parts.push(`COMMENT ${String(node.metadata.comment)}`)
  return parts.filter(Boolean).join(' ')
}

/** 索引/外键等对象的兜底定义文本（对等 formatObjectDefinition） */
export function formatObjectDefinition(node: TreeNode, quote: (name: string) => string, isPgLike: boolean): string {
  if (node.type === 'index') {
    const name = metaStr(node, 'name')
    const table = metaStr(node, 'table')
    const schema = metaStr(node, 'schema')
    const columns = Array.isArray(node.metadata?.columns)
      ? node.metadata.columns.map((column: string) => quote(column)).join(', ')
      : ''
    const qualifiedTable = schema ? `${quote(schema)}.${quote(table)}` : quote(table)

    if (node.metadata?.is_primary) {
      return isPgLike
        ? `ALTER TABLE ${qualifiedTable} ADD CONSTRAINT ${quote(name)} PRIMARY KEY (${columns})`
        : `ALTER TABLE ${qualifiedTable} ADD PRIMARY KEY (${columns})`
    }

    const indexKeyword = node.metadata?.is_unique ? 'UNIQUE INDEX' : 'INDEX'
    const usingClause = isPgLike && metaStr(node, 'index_type')
      ? ` USING ${metaStr(node, 'index_type')}`
      : ''
    return `CREATE ${indexKeyword} ${quote(name)} ON ${qualifiedTable}${usingClause} (${columns})`
  }

  if (node.type === 'foreign-key') {
    return `${metaStr(node, 'name')} FOREIGN KEY (${metaStr(node, 'column_name')}) REFERENCES ${metaStr(node, 'referenced_table_name')} (${metaStr(node, 'referenced_column_name')})`
  }

  if (node.metadata?.definition) {
    return String(node.metadata.definition)
  }

  return metaStr(node, 'name') || node.title
}

export function buildRoutineSignature(node: TreeNode): string {
  const name = metaStr(node, 'name') || node.title
  const args = metaStr(node, 'arguments')
  return `${name}(${args})`
}

export function buildRoutinePlaceholders(node: TreeNode): string {
  const args = metaStr(node, 'arguments') || metaStr(node, 'identity_arguments')
  if (!args) return ''

  return args
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, index) => {
      const parts = item.split(/\s+/).filter(Boolean)
      const filtered = parts.filter((part) => !['in', 'out', 'inout', 'variadic'].includes(part.toLowerCase()))
      const candidate = filtered[0] || parts[0] || `arg${index + 1}`
      const looksLikeTypeOnly = /^(bigint|smallint|integer|int|int2|int4|int8|numeric|decimal|real|double|precision|text|varchar|character|char|boolean|bool|date|time|timestamp|interval|json|jsonb|uuid|bytea|geometry|geography)$/i.test(candidate)
      const name = looksLikeTypeOnly ? `arg${index + 1}` : candidate
      return `/* ${name} */`
    })
    .join(', ')
}

/** 触发器删除 SQL（PG 系带 ON 表名 / MySQL 带 schema 前缀 / SQLite 仅名字；其余方言不支持） */
export function buildDropTriggerSql(
  node: TreeNode,
  quote: (name: string) => string,
  opts: { isPgLike: boolean; dbType?: string; unsupportedMessage: string },
): string {
  const triggerName = metaStr(node, 'name')
  const tableName = metaStr(node, 'table')
  const schema = metaStr(node, 'schema')
  if (opts.isPgLike) {
    const tableIdent = `${schema ? `${quote(schema)}.` : ''}${quote(tableName)}`
    return `DROP TRIGGER ${quote(triggerName)} ON ${tableIdent}`
  }
  if (opts.dbType === 'mysql') {
    return `DROP TRIGGER ${schema ? `${quote(schema)}.` : ''}${quote(triggerName)}`
  }
  if (opts.dbType === 'sqlite') {
    return `DROP TRIGGER ${quote(triggerName)}`
  }
  throw new Error(opts.unsupportedMessage)
}

export function buildDropRuleSql(
  node: TreeNode,
  quote: (name: string) => string,
  opts: { isPgLike: boolean; unsupportedMessage: string },
): string {
  if (!opts.isPgLike) {
    throw new Error(opts.unsupportedMessage)
  }
  const ruleName = metaStr(node, 'name')
  const tableName = metaStr(node, 'table')
  const schema = metaStr(node, 'schema')
  return `DROP RULE ${quote(ruleName)} ON ${schema ? `${quote(schema)}.` : ''}${quote(tableName)}`
}

export function buildDropConstraintSql(
  node: TreeNode,
  quote: (name: string) => string,
  opts: { isPgLike: boolean; unsupportedMessage: string },
): string {
  if (!opts.isPgLike) {
    throw new Error(opts.unsupportedMessage)
  }
  const constraintName = metaStr(node, 'name')
  const tableName = metaStr(node, 'table')
  const schema = metaStr(node, 'schema')
  return `ALTER TABLE ${schema ? `${quote(schema)}.` : ''}${quote(tableName)} DROP CONSTRAINT ${quote(constraintName)}`
}

/** 函数/过程/聚合的调用 SQL（对等 handleGenerateCallSql 的拼接段） */
export function buildRoutineCallSql(node: TreeNode, quote: (name: string) => string): string {
  const name = metaStr(node, 'name') || node.title
  const schema = metaStr(node, 'schema')
  const qualifiedName = schema ? `${quote(schema)}.${quote(name)}` : quote(name)
  const placeholders = buildRoutinePlaceholders(node)
  const returnType = metaStr(node, 'return_type').toLowerCase()

  if (node.type === 'procedure') {
    return `CALL ${qualifiedName}(${placeholders});`
  }
  if (node.type === 'aggregate') {
    const aggregateArgs = placeholders || '/* expression */'
    return `SELECT ${qualifiedName}(${aggregateArgs})\nFROM /* source */;`
  }
  if (returnType.startsWith('setof ') || returnType.startsWith('table(')) {
    return `SELECT * FROM ${qualifiedName}(${placeholders});`
  }
  return `SELECT ${qualifiedName}(${placeholders});`
}
