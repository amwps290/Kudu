/**
 * SQL 工具函数 — 跨组件复用的 SQL 值转义与 WHERE 条件构建
 */
import type { ColumnInfo } from '@/types/database'

/** 将任意值转为 SQL 字面量 */
export function escapeSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  return `'${String(value).replace(/'/g, "''")}'`
}

/** 根据数据库类型返回正确的标识符引用符 */
export function quoteIdentifier(name: string, dbType: string): string {
  if (dbType === 'sqlite' || dbType === 'postgresql' || dbType === 'opengauss') return `"${name}"`
  return `\`${name}\``
}

/** 构建 WHERE 子句（相等条件） */
export function buildWhereSql(
  whereConditions: Record<string, unknown>,
  dbType: string
): string {
  return Object.entries(whereConditions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([field, value]) =>
      value === null
        ? `${quoteIdentifier(field, dbType)} IS NULL`
        : `${quoteIdentifier(field, dbType)} = ${escapeSqlLiteral(value)}`
    )
    .join(' AND ')
}

/** 检查列是否有默认值或自增 */
export function hasColumnDefault(column: Pick<ColumnInfo, 'default_value' | 'is_auto_increment'>): boolean {
  return column.default_value !== null && column.default_value !== undefined ||
    column.is_auto_increment === true
}

/** 构建 INSERT 语句 */
export function buildInsertSql(
  tableRef: string,
  data: Record<string, unknown>,
  dbType: string
): string {
  const columns = Object.keys(data)
  const q = (n: string) => quoteIdentifier(n, dbType)
  return `INSERT INTO ${tableRef} (${columns.map(q).join(', ')}) VALUES (${columns.map(c => escapeSqlLiteral(data[c])).join(', ')});`
}

/** 构建 UPDATE 语句 */
export function buildUpdateSql(
  tableRef: string,
  field: string,
  value: unknown,
  whereConditions: Record<string, unknown>,
  dbType: string
): string {
  return `UPDATE ${tableRef} SET ${quoteIdentifier(field, dbType)} = ${escapeSqlLiteral(value)} WHERE ${buildWhereSql(whereConditions, dbType)};`
}

/** 构建 DELETE 语句 */
export function buildDeleteSql(
  tableRef: string,
  whereConditions: Record<string, unknown>,
  dbType: string
): string {
  return `DELETE FROM ${tableRef} WHERE ${buildWhereSql(whereConditions, dbType)};`
}
