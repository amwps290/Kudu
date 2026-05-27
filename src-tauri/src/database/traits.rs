use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 数据库连接配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub database: Option<String>,
    pub ssl: bool,
    pub connection_timeout: u64,
    pub pool_size: u32,
    pub mysql_charset: Option<String>,
    pub mysql_init_sql: Option<String>,
    #[serde(default)]
    pub read_only: bool,
}

/// 数据库类型枚举
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseType {
    MySQL,
    PostgreSQL,
    OpenGauss,
    SQLite,
    MongoDB,
    Redis,
}

impl std::str::FromStr for DatabaseType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "mysql" => Ok(DatabaseType::MySQL),
            "postgresql" | "postgres" => Ok(DatabaseType::PostgreSQL),
            "opengauss" | "open_gauss" => Ok(DatabaseType::OpenGauss),
            "sqlite" => Ok(DatabaseType::SQLite),
            "mongodb" | "mongo" => Ok(DatabaseType::MongoDB),
            "redis" => Ok(DatabaseType::Redis),
            _ => Err(format!("不支持的数据库类型: {}", s)),
        }
    }
}

impl std::fmt::Display for DatabaseType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            DatabaseType::MySQL => "mysql",
            DatabaseType::PostgreSQL => "postgresql",
            DatabaseType::OpenGauss => "opengauss",
            DatabaseType::SQLite => "sqlite",
            DatabaseType::MongoDB => "mongodb",
            DatabaseType::Redis => "redis",
        };
        write!(f, "{}", s)
    }
}

/// 数据库消息 (NOTICE, DEBUG, WARNING 等)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbMessage {
    pub severity: String,
    pub text: String,
}

/// 查询结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<HashMap<String, serde_json::Value>>,
    pub affected_rows: u64,
    pub execution_time_ms: u128,
    #[serde(default)]
    pub messages: Vec<DbMessage>,
}

impl QueryResult {
    /// 创建一个空的查询结果（无列、无行、无影响行数）
    pub fn empty(execution_time_ms: u128) -> Self {
        Self {
            columns: vec![],
            rows: vec![],
            affected_rows: 0,
            execution_time_ms,
            messages: vec![],
        }
    }
}

/// 批量执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchExecutionResult {
    pub results: Vec<QueryResult>,
    pub statements_total: usize,
    pub statements_succeeded: usize,
    pub failed_statement_index: Option<usize>,
    pub error_message: Option<String>,
    pub was_cancelled: bool,
    pub execution_time_ms: u128,
    #[serde(default)]
    pub messages: Vec<DbMessage>,
}

/// 数据库元数据 - 数据库信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseInfo {
    pub name: String,
    pub charset: Option<String>,
    pub collation: Option<String>,
    pub ctype: Option<String>,
    pub owner: Option<String>,
    pub tablespace: Option<String>,
    pub size_bytes: Option<i64>,
    pub allow_connections: Option<bool>,
    pub connection_limit: Option<i32>,
    pub is_template: Option<bool>,
}

/// PostgreSQL partition child metadata.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TablePartitionInfo {
    pub name: String,
    pub schema: Option<String>,
    pub bound: Option<String>,
}

/// 数据库元数据 - 表信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub oid: Option<i64>,
    pub name: String,
    pub schema: Option<String>,
    pub table_type: String,
    pub engine: Option<String>,
    pub owner: Option<String>,
    pub tablespace: Option<String>,
    pub rows: Option<u64>,
    pub size_mb: Option<f64>,
    pub size_bytes: Option<i64>,
    pub main_size_bytes: Option<i64>,
    pub toast_size_bytes: Option<i64>,
    pub persistence: Option<String>,
    pub fillfactor: Option<String>,
    pub comment: Option<String>,
    #[serde(default)]
    pub is_partitioned: bool,
    pub partition_key: Option<String>,
    pub partition_parent: Option<String>,
    pub partition_bound: Option<String>,
    #[serde(default)]
    pub partitions: Vec<TablePartitionInfo>,
}

/// 数据库元数据 - 列信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
    pub is_primary_key: bool,
    pub is_auto_increment: bool,
    pub comment: Option<String>,
    pub character_maximum_length: Option<i64>,
    pub numeric_precision: Option<i64>,
    pub numeric_scale: Option<i64>,
    pub collation: Option<String>,
    pub is_identity: Option<bool>,
    pub identity_generation: Option<String>,
    pub generated_expression: Option<String>,
}

/// 数据库元数据 - 索引信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexInfo {
    pub oid: Option<i64>,
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    pub is_primary: bool,
    pub index_type: String,
    pub tablespace: Option<String>,
    pub size_bytes: Option<i64>,
    pub fillfactor: Option<String>,
    pub include_columns: Option<Vec<String>>,
    pub predicate: Option<String>,
    pub definition: Option<String>,
}

/// 数据库元数据 - Schema 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaInfo {
    pub name: String,
    pub oid: Option<i64>,
    pub owner: Option<String>,
    pub comment: Option<String>,
}

/// 数据库元数据 - 函数信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionInfo {
    pub oid: Option<i64>,
    pub name: String,
    pub schema: Option<String>,
    pub return_type: Option<String>,
    pub arguments: Option<String>,
    pub identity_arguments: Option<String>,
    pub language: Option<String>,
    pub function_type: String, // "function" 或 "aggregate"
    pub volatility: Option<String>,
    pub security_definer: Option<bool>,
    pub parallel: Option<String>,
    pub is_strict: Option<bool>,
    pub leakproof: Option<bool>,
    pub estimated_cost: Option<f64>,
    pub estimated_rows: Option<f64>,
    pub comment: Option<String>,
}

/// 数据库元数据 - 扩展信息 (PostgreSQL 专用)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionInfo {
    pub oid: Option<i64>,
    pub name: String,
    pub version: String,
    pub schema: Option<String>,
    pub relocatable: Option<bool>,
    pub comment: Option<String>,
}

/// 数据库元数据 - Sequence 信息 (PostgreSQL 专用)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SequenceInfo {
    pub oid: Option<i64>,
    pub name: String,
    pub schema: Option<String>,
    pub data_type: Option<String>,
    pub start_value: Option<i64>,
    pub min_value: Option<i64>,
    pub max_value: Option<i64>,
    pub increment_by: Option<i64>,
    pub cache_size: Option<i64>,
    pub cycle: Option<bool>,
    pub comment: Option<String>,
}

/// 数据库元数据 - Sequence 状态信息 (PostgreSQL 专用)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SequenceStateInfo {
    pub name: String,
    pub schema: Option<String>,
    pub last_value: Option<i64>,
    pub start_value: Option<i64>,
    pub increment_by: Option<i64>,
    pub next_value: Option<i64>,
    pub is_called: Option<bool>,
}

/// 数据库元数据 - Enum Type 信息 (PostgreSQL 专用)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnumTypeInfo {
    pub oid: Option<i64>,
    pub name: String,
    pub schema: Option<String>,
    pub labels: Vec<String>,
    pub comment: Option<String>,
}

/// 数据库元数据 - Domain Type 约束信息 (PostgreSQL 专用)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainConstraintInfo {
    pub name: String,
    pub constraint_type: String,
    pub definition: Option<String>,
}

/// 数据库元数据 - Domain Type 信息 (PostgreSQL 专用)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainTypeInfo {
    pub oid: Option<i64>,
    pub name: String,
    pub schema: Option<String>,
    pub base_type: String,
    pub default_value: Option<String>,
    pub nullable: bool,
    pub constraints: Vec<DomainConstraintInfo>,
    pub comment: Option<String>,
}

/// 数据库元数据 - Composite Type 字段信息 (PostgreSQL 专用)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompositeFieldInfo {
    pub name: String,
    pub data_type: String,
}

/// 数据库元数据 - Composite Type 信息 (PostgreSQL 专用)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompositeTypeInfo {
    pub oid: Option<i64>,
    pub name: String,
    pub schema: Option<String>,
    pub fields: Vec<CompositeFieldInfo>,
    pub comment: Option<String>,
}

/// 数据库元数据 - 外键信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForeignKeyInfo {
    pub name: String,
    pub column_name: String,
    pub referenced_table_name: String,
    pub referenced_column_name: String,
    pub update_rule: Option<String>,
    pub delete_rule: Option<String>,
}

/// 数据库元数据 - 触发器信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerInfo {
    pub name: String,
    pub table_name: String,
    pub timing: Option<String>,
    pub event: Option<String>,
    pub enabled: Option<bool>,
    pub orientation: Option<String>,
    pub definition: Option<String>,
}

/// 数据库元数据 - 表约束信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableConstraintInfo {
    pub name: String,
    pub constraint_type: String,
    pub columns: Vec<String>,
    pub definition: Option<String>,
}

/// 数据库元数据 - 规则信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleInfo {
    pub name: String,
    pub event: Option<String>,
    pub is_instead: Option<bool>,
    pub definition: Option<String>,
}

/// 表结构变更类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum TableChange {
    #[serde(rename = "add_column")]
    AddColumn(ColumnInfo),
    #[serde(rename = "modify_column")]
    ModifyColumn { old_name: String, new_column: ColumnInfo },
    #[serde(rename = "reorder_column")]
    ReorderColumn { column: ColumnInfo, after_column: Option<String> },
    #[serde(rename = "drop_column")]
    DropColumn(String),
    #[serde(rename = "add_index")]
    AddIndex(IndexInfo),
    #[serde(rename = "drop_index")]
    DropIndex(String),
    #[serde(rename = "add_foreign_key")]
    AddForeignKey(ForeignKeyInfo),
    #[serde(rename = "drop_foreign_key")]
    DropForeignKey(String),
}

/// 数据库操作结果
pub type DbResult<T> = Result<T, DbError>;

/// 数据库错误
#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("连接失败: {0}")]
    ConnectionFailed(String),

    #[error("查询执行失败: {0}")]
    QueryFailed(String),

    #[error("查询已取消")]
    QueryCancelled,

    #[error("不支持的数据库类型")]
    UnsupportedDatabase,

    #[error("配置错误: {0}")]
    ConfigError(String),

    #[error("认证失败: {0}")]
    AuthenticationFailed(String),

    #[error("网络超时: {0}")]
    NetworkTimeout(String),

    #[error("会话不存在: {0}")]
    SessionNotFound(String),

    #[error("权限不足: {0}")]
    PermissionDenied(String),

    #[error("其他错误: {0}")]
    Other(String),
}

impl DbError {
    pub fn not_connected() -> Self {
        DbError::ConnectionFailed("未连接数据库".into())
    }
}

impl Serialize for DbError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// 数据库操作 Trait
#[async_trait]
pub trait DatabaseOperations: Send + Sync {
    /// 测试连接（创建新连接）
    async fn test_connection(&self, config: &ConnectionConfig) -> DbResult<bool>;

    /// 连接数据库 - 改为 &self 以支持 Arc 共享
    async fn connect(&self, config: ConnectionConfig) -> DbResult<()>;

    /// 断开连接 - 改为 &self
    async fn disconnect(&self) -> DbResult<()>;

    /// 检查已建立连接的健康状态（轻量 ping）
    async fn check_health(&self) -> DbResult<bool> {
        Err(DbError::Other("该数据库类型不支持健康检查".into()))
    }

    /// 执行查询 - 支持多结果集
    async fn execute_query(&self, sql: &str, database: Option<&str>, query_id: Option<u64>) -> DbResult<Vec<QueryResult>>;

    /// 获取数据库列表
    async fn get_databases(&self) -> DbResult<Vec<DatabaseInfo>>;

    /// 获取表列表
    async fn get_tables(&self, database: Option<&str>) -> DbResult<Vec<TableInfo>>;

    /// 获取表结构
    async fn get_table_structure(&self, table: &str, schema: Option<&str>, database: Option<&str>) -> DbResult<Vec<ColumnInfo>>;

    /// 更新数据
    async fn update_data(&self, _table: &str, _schema: Option<&str>, _column: &str, _value: Option<String>, _where_conditions: HashMap<String, serde_json::Value>) -> DbResult<()> {
        Err(DbError::Other("该数据库类型不支持此更新操作".into()))
    }

    /// 插入数据
    async fn insert_data(&self, _table: &str, _schema: Option<&str>, _data: HashMap<String, serde_json::Value>) -> DbResult<()> {
        Err(DbError::Other("该数据库类型不支持此插入操作".into()))
    }

    /// 删除数据
    async fn delete_data(&self, _table: &str, _schema: Option<&str>, _where_conditions: HashMap<String, serde_json::Value>) -> DbResult<()> {
        Err(DbError::Other("该数据库类型不支持此删除操作".into()))
    }

    /// 清空表数据
    async fn truncate_table(&self, _table: &str, _schema: Option<&str>) -> DbResult<()> {
        Err(DbError::Other("该数据库类型不支持清空表".into()))
    }

    /// 获取索引信息
    async fn get_indexes(&self, table: &str, schema: Option<&str>) -> DbResult<Vec<IndexInfo>>;

    /// 获取 Schema 下的所有索引
    async fn get_schema_indexes(&self, _database: Option<&str>, _schema: Option<&str>) -> DbResult<Vec<IndexInfo>> {
        Ok(Vec::new())
    }
    
    /// 获取表/视图的 DDL (CREATE 语句)
    async fn get_table_ddl(&self, _table: &str, _schema: Option<&str>) -> DbResult<String> {
        Err(DbError::Other("该数据库类型不支持 DDL 生成".into()))
    }

    /// 获取视图定义
    async fn get_view_definition(&self, _view: &str, _schema: Option<&str>) -> DbResult<String> {
        Err(DbError::Other("该数据库类型不支持视图定义".into()))
    }

    /// 获取索引定义
    async fn get_index_definition(&self, _index: &str, _schema: Option<&str>, _database: Option<&str>) -> DbResult<String> {
        Err(DbError::Other("该数据库类型不支持索引定义".into()))
    }

    /// 获取函数/过程定义
    async fn get_routine_definition(&self, _name: &str, _schema: Option<&str>, _database: Option<&str>, _routine_type: &str, _identity_arguments: Option<&str>, _oid: Option<i64>) -> DbResult<String> {
        Err(DbError::Other("该数据库类型不支持函数定义".into()))
    }
    
    async fn get_views(&self, _database: Option<&str>) -> DbResult<Vec<TableInfo>> {
        Ok(Vec::new())
    }

    async fn get_materialized_views(&self, _database: Option<&str>, _schema: Option<&str>) -> DbResult<Vec<TableInfo>> {
        Ok(Vec::new())
    }
    
    /// 切换数据库 - 改为 &self
    async fn switch_database(&self, _database: &str) -> DbResult<()> {
        Ok(())
    }
    
    /// 获取执行计划
    async fn explain_query(&self, _sql: &str, _database: Option<&str>, _query_id: Option<u64>) -> DbResult<Vec<QueryResult>> {
        Err(DbError::Other("该数据库类型不支持执行计划分析".into()))
    }

    /// 取消当前查询
    async fn cancel_query(&self, _query_id: u64) -> DbResult<bool> {
        Ok(false)
    }
    
    fn as_any(&self) -> &dyn std::any::Any;

    async fn get_schemas(&self, _database: Option<&str>) -> DbResult<Vec<SchemaInfo>> {
        Ok(Vec::new())
    }

    async fn get_functions(&self, _database: Option<&str>, _schema: Option<&str>) -> DbResult<Vec<FunctionInfo>> {
        Ok(Vec::new())
    }

    async fn get_procedures(&self, _database: Option<&str>, _schema: Option<&str>) -> DbResult<Vec<FunctionInfo>> {
        Ok(Vec::new())
    }

    async fn get_aggregate_functions(&self, _database: Option<&str>, _schema: Option<&str>) -> DbResult<Vec<FunctionInfo>> {
        Ok(Vec::new())
    }

    async fn get_extensions(&self, _database: Option<&str>) -> DbResult<Vec<ExtensionInfo>> {
        Ok(Vec::new())
    }

    async fn get_available_extensions(&self, _database: Option<&str>) -> DbResult<Vec<String>> {
        Ok(Vec::new())
    }

    async fn get_sequences(&self, _database: Option<&str>, _schema: Option<&str>) -> DbResult<Vec<SequenceInfo>> {
        Ok(Vec::new())
    }

    async fn get_sequence_definition(&self, _name: &str, _schema: Option<&str>, _database: Option<&str>, _oid: Option<i64>) -> DbResult<String> {
        Err(DbError::Other("该数据库类型不支持序列定义".into()))
    }

    async fn get_sequence_state(&self, _name: &str, _schema: Option<&str>, _database: Option<&str>, _oid: Option<i64>) -> DbResult<SequenceStateInfo> {
        Err(DbError::Other("该数据库类型不支持序列状态".into()))
    }

    async fn get_enum_types(&self, _database: Option<&str>, _schema: Option<&str>) -> DbResult<Vec<EnumTypeInfo>> {
        Ok(Vec::new())
    }

    async fn get_enum_definition(&self, _name: &str, _schema: Option<&str>, _database: Option<&str>, _oid: Option<i64>) -> DbResult<String> {
        Err(DbError::Other("该数据库类型不支持枚举类型定义".into()))
    }

    async fn get_domain_types(&self, _database: Option<&str>, _schema: Option<&str>) -> DbResult<Vec<DomainTypeInfo>> {
        Ok(Vec::new())
    }

    async fn get_domain_definition(&self, _name: &str, _schema: Option<&str>, _database: Option<&str>, _oid: Option<i64>) -> DbResult<String> {
        Err(DbError::Other("该数据库类型不支持域类型定义".into()))
    }

    async fn get_composite_types(&self, _database: Option<&str>, _schema: Option<&str>) -> DbResult<Vec<CompositeTypeInfo>> {
        Ok(Vec::new())
    }

    async fn get_composite_definition(&self, _name: &str, _schema: Option<&str>, _database: Option<&str>, _oid: Option<i64>) -> DbResult<String> {
        Err(DbError::Other("该数据库类型不支持复合类型定义".into()))
    }

    /// 获取外键信息
    async fn get_foreign_keys(&self, _table: &str, _schema: Option<&str>) -> DbResult<Vec<ForeignKeyInfo>> {
        Ok(Vec::new())
    }

    /// 获取触发器信息
    async fn get_triggers(&self, _table: &str, _schema: Option<&str>, _database: Option<&str>) -> DbResult<Vec<TriggerInfo>> {
        Ok(Vec::new())
    }

    /// 获取表约束信息
    async fn get_table_constraints(&self, _table: &str, _schema: Option<&str>, _database: Option<&str>) -> DbResult<Vec<TableConstraintInfo>> {
        Ok(Vec::new())
    }

    /// 获取规则信息
    async fn get_rules(&self, _table: &str, _schema: Option<&str>, _database: Option<&str>) -> DbResult<Vec<RuleInfo>> {
        Ok(Vec::new())
    }

    /// 变更表结构
    async fn alter_table(&self, _table: &str, _schema: Option<&str>, _database: Option<&str>, _changes: Vec<TableChange>) -> DbResult<()> {
        Err(DbError::Other("该数据库类型不支持在线表结构变更".into()))
    }
}
