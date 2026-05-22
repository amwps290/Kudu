import { invoke } from '@tauri-apps/api/core'
import type { 
  DatabaseInfo, TableInfo, SchemaInfo, ColumnInfo, IndexInfo, ForeignKeyInfo, TriggerInfo, TableConstraintInfo, RuleInfo, FunctionInfo, ExtensionInfo 
} from '@/types/database'
import { withAutoReconnect } from '@/utils/autoReconnect'

export const metadataApi = {
  /**
   * 获取数据库列表
   */
  async getDatabases(connectionId: string): Promise<DatabaseInfo[]> {
    return withAutoReconnect(connectionId, () => invoke<DatabaseInfo[]>('get_databases', { connectionId }), true)
  },

  /**
   * 获取表列表
   */
  async getTables(connectionId: string, database?: string | null): Promise<TableInfo[]> {
    return withAutoReconnect(connectionId, () => invoke<TableInfo[]>('get_tables', { connectionId, database }), true)
  },

  /**
   * 获取视图列表
   */
  async getViews(connectionId: string, database?: string | null): Promise<TableInfo[]> {
    return withAutoReconnect(connectionId, () => invoke<TableInfo[]>('get_views', { connectionId, database }), true)
  },

  /**
   * 获取 Schema 列表 (PostgreSQL)
   */
  async getSchemas(connectionId: string, database?: string | null): Promise<SchemaInfo[]> {
    return withAutoReconnect(connectionId, () => invoke<SchemaInfo[]>('get_schemas', { connectionId, database }), true)
  },

  /**
   * 获取指定 Schema 下的表
   */
  async getSchemaTables(connectionId: string, database: string, schema: string): Promise<TableInfo[]> {
    return withAutoReconnect(connectionId, () => invoke<TableInfo[]>('get_schema_tables', { connectionId, database, schema }), true)
  },

  /**
   * 获取指定 Schema 下的视图
   */
  async getSchemaViews(connectionId: string, database: string, schema: string): Promise<TableInfo[]> {
    return withAutoReconnect(connectionId, () => invoke<TableInfo[]>('get_schema_views', { connectionId, database, schema }), true)
  },

  /**
   * 获取函数列表
   */
  async getSchemaFunctions(connectionId: string, database: string, schema: string): Promise<FunctionInfo[]> {
    return withAutoReconnect(connectionId, () => invoke<FunctionInfo[]>('get_schema_functions', { connectionId, database, schema }), true)
  },

  /**
   * 获取存储过程列表
   */
  async getSchemaProcedures(connectionId: string, database: string, schema: string): Promise<FunctionInfo[]> {
    return withAutoReconnect(connectionId, () => invoke<FunctionInfo[]>('get_schema_procedures', { connectionId, database, schema }), true)
  },

  /**
   * 获取聚合函数列表
   */
  async getSchemaAggregateFunctions(connectionId: string, database: string, schema: string): Promise<FunctionInfo[]> {
    return withAutoReconnect(connectionId, () => invoke<FunctionInfo[]>('get_schema_aggregate_functions', { connectionId, database, schema }), true)
  },

  /**
   * 获取数据库扩展 (PostgreSQL)
   */
  async getDatabaseExtensions(connectionId: string, database: string): Promise<ExtensionInfo[]> {
    return withAutoReconnect(connectionId, () => invoke<ExtensionInfo[]>('get_database_extensions', { connectionId, database }), true)
  },

  /**
   * 获取表结构
   */
  async getTableStructure(params: {
    connectionId: string,
    table: string,
    database?: string | null,
    schema?: string | null
  }): Promise<ColumnInfo[]> {
    return withAutoReconnect(params.connectionId, () => invoke<ColumnInfo[]>('get_table_structure', params), true)
  },

  /**
   * 获取表索引
   */
  async getTableIndexes(params: {
    connectionId: string,
    table: string,
    schema?: string | null
  }): Promise<IndexInfo[]> {
    return withAutoReconnect(params.connectionId, () => invoke<IndexInfo[]>('get_table_indexes', params), true)
  },

  /**
   * 获取表外键
   */
  async getTableForeignKeys(params: {
    connectionId: string,
    table: string,
    schema?: string | null
  }): Promise<ForeignKeyInfo[]> {
    return withAutoReconnect(params.connectionId, () => invoke<ForeignKeyInfo[]>('get_table_foreign_keys', params), true)
  },

  /**
   * 获取表触发器
   */
  async getTableTriggers(params: {
    connectionId: string,
    table: string,
    database?: string | null,
    schema?: string | null
  }): Promise<TriggerInfo[]> {
    return withAutoReconnect(params.connectionId, () => invoke<TriggerInfo[]>('get_table_triggers', params), true)
  },

  /**
   * 获取表约束
   */
  async getTableConstraints(params: {
    connectionId: string,
    table: string,
    database?: string | null,
    schema?: string | null
  }): Promise<TableConstraintInfo[]> {
    return withAutoReconnect(params.connectionId, () => invoke<TableConstraintInfo[]>('get_table_constraints', params), true)
  },

  /**
   * 获取表规则
   */
  async getTableRules(params: {
    connectionId: string,
    table: string,
    database?: string | null,
    schema?: string | null
  }): Promise<RuleInfo[]> {
    return withAutoReconnect(params.connectionId, () => invoke<RuleInfo[]>('get_table_rules', params), true)
  },

  /**
   * 获取 Schema 下的所有索引
   */
  async getSchemaIndexes(connectionId: string, database: string, schema: string): Promise<IndexInfo[]> {
    return withAutoReconnect(connectionId, () => invoke<IndexInfo[]>('get_schema_indexes', { connectionId, database, schema }), true)
  },

  /**
   * 获取创建表的 DDL
   */
  async getCreateTableDdl(params: {
    connectionId: string,
    table: string,
    database?: string | null,
    schema?: string | null
  }): Promise<string> {
    return withAutoReconnect(params.connectionId, () => invoke<string>('get_create_table_ddl', params), true)
  },

  /**
   * 获取视图定义
   */
  async getViewDefinition(params: {
    connectionId: string,
    database: string,
    view: string,
    schema?: string | null
  }): Promise<string> {
    return withAutoReconnect(params.connectionId, () => invoke<string>('get_view_definition', params), true)
  }
}
