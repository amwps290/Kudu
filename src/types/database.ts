/**
 * 数据库类型定义
 */

export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite' | 'mongodb' | 'redis'

/**
 * 连接配置
 */
export interface ConnectionConfig {
  id: string
  name: string
  db_type: DatabaseType
  host: string
  port: number
  username: string
  password?: string
  database?: string
  ssl: boolean
  connection_timeout: number
  pool_size: number
  mysql_charset?: string
  mysql_init_sql?: string
  read_only: boolean
  group?: string
  color?: string
  tags: string[]
  created_at: number
  updated_at: number
}

/**
 * 连接测试结果
 */
export interface ConnectionTestResult {
  success: boolean
  message: string
  version?: string
  ping_time_ms: number
}

/**
 * 连接状态
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error'

/**
 * 数据库信息
 */
export interface DatabaseInfo {
  name: string
  charset?: string
  collation?: string
  ctype?: string
  owner?: string
  tablespace?: string
  size_bytes?: number
  allow_connections?: boolean
  connection_limit?: number
  is_template?: boolean
}

export interface TablePartitionInfo {
  name: string
  schema?: string
  bound?: string
}

/**
 * 表信息
 */
export interface TableInfo {
  oid?: number
  name: string
  schema?: string
  table_type: string
  engine?: string
  owner?: string
  tablespace?: string
  rows?: number
  size_mb?: number
  size_bytes?: number
  main_size_bytes?: number
  toast_size_bytes?: number
  persistence?: string
  fillfactor?: string
  comment?: string
  is_partitioned?: boolean
  partition_key?: string
  partition_parent?: string
  partition_bound?: string
  partitions?: TablePartitionInfo[]
}

/**
 * 列信息
 */
export interface ColumnInfo {
  name: string
  data_type: string
  nullable: boolean
  default_value?: string
  is_primary_key: boolean
  is_auto_increment: boolean
  comment?: string
  character_maximum_length?: number
  numeric_precision?: number
  numeric_scale?: number
  collation?: string
  is_identity?: boolean
  identity_generation?: string
  generated_expression?: string
}

/**
 * 索引信息
 */
export interface IndexInfo {
  oid?: number
  name: string
  columns: string[]
  is_unique: boolean
  is_primary: boolean
  index_type: string
  tablespace?: string
  size_bytes?: number
  fillfactor?: string
  include_columns?: string[]
  predicate?: string | null
  definition?: string | null
}

/**
 * 外键信息
 */
export interface ForeignKeyInfo {
  name: string
  column_name: string
  referenced_table_name: string
  referenced_column_name: string
  update_rule?: string
  delete_rule?: string
}

/**
 * 触发器信息
 */
export interface TriggerInfo {
  name: string
  table_name: string
  timing?: string
  event?: string
  enabled?: boolean
  orientation?: string
  definition?: string
}

/**
 * 表约束信息
 */
export interface TableConstraintInfo {
  name: string
  constraint_type: string
  columns: string[]
  definition?: string
}

/**
 * 规则信息
 */
export interface RuleInfo {
  name: string
  event?: string
  is_instead?: boolean
  definition?: string
}

/**
 * Schema 信息
 */
export interface SchemaInfo {
  name: string
  oid?: number
  owner?: string
  comment?: string
}

/**
 * 函数信息
 */
export interface FunctionInfo {
  oid?: number
  name: string
  schema?: string
  return_type?: string
  arguments?: string
  identity_arguments?: string
  language?: string
  function_type: string
  volatility?: string
  security_definer?: boolean
  parallel?: string
  is_strict?: boolean
  leakproof?: boolean
  estimated_cost?: number
  estimated_rows?: number
  comment?: string
}

/**
 * 扩展信息
 */
export interface ExtensionInfo {
  oid?: number
  name: string
  version: string
  schema?: string
  relocatable?: boolean
  comment?: string
}

export interface SequenceInfo {
  oid?: number
  name: string
  schema?: string
  data_type?: string
  start_value?: number | null
  min_value?: number | null
  max_value?: number | null
  increment_by?: number | null
  cache_size?: number | null
  cycle?: boolean | null
  comment?: string
}

export interface SequenceStateInfo {
  name: string
  schema?: string
  last_value?: number | null
  start_value?: number | null
  increment_by?: number | null
  next_value?: number | null
  is_called?: boolean | null
}

export interface EnumTypeInfo {
  oid?: number
  name: string
  schema?: string
  labels: string[]
  comment?: string
}

export interface DomainConstraintInfo {
  name: string
  constraint_type: string
  definition?: string
}

export interface DomainTypeInfo {
  oid?: number
  name: string
  schema?: string
  base_type: string
  default_value?: string | null
  nullable: boolean
  constraints: DomainConstraintInfo[]
  comment?: string
}

export interface CompositeFieldInfo {
  name: string
  data_type: string
}

export interface CompositeTypeInfo {
  oid?: number
  name: string
  schema?: string
  fields: CompositeFieldInfo[]
  comment?: string
}

/**
 * 查询结果
 */
export interface DbMessage {
  severity: string
  text: string
}

export interface QueryResult {
  columns: string[]
  rows: Record<string, any>[]
  affected_rows: number
  execution_time_ms: number
  messages: DbMessage[]
}

/**
 * 数据库对象类型
 */
export type DatabaseObjectType = 
  | 'database'
  | 'table'
  | 'view'
  | 'procedure'
  | 'function'
  | 'trigger'
  | 'sequence'
  | 'collection'
  | 'index'
  | 'enum-type'
  | 'enum-label'
  | 'domain-type'
  | 'domain-detail'
  | 'domain-constraint'
  | 'composite-type'
  | 'composite-field'

/**
 * 数据库对象树节点
 */
export interface DatabaseTreeNode {
  key: string
  title: string
  type: DatabaseObjectType
  icon?: string
  children?: DatabaseTreeNode[]
  isLeaf?: boolean
  metadata?: Record<string, unknown>
}

/**
 * 持久化存储的连接配置（对应 Rust StoredConnection）
 */
export interface StoredConnection {
  id: string
  name: string
  db_type: DatabaseType
  host: string
  port: number
  username: string
  encrypted_password?: string
  database?: string
  ssl: boolean
  connection_timeout: number
  pool_size: number
  mysql_charset?: string
  mysql_init_sql?: string
  read_only: boolean
  group?: string
  color?: string
  tags: string[]
  created_at: number
  updated_at: number
}

/**
 * 脚本文件信息（对应 Rust ScriptInfo）
 */
export interface ScriptInfo {
  name: string
  path: string
  last_modified: number
  size: number
}
