use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use std::time::Instant;
use tracing::{debug, error, info, instrument, warn};

use super::traits::*;
use super::constants::DEFAULT_SESSION_ID;
#[cfg(feature = "mysql")]
use super::mysql::MySqlDatabase;

/// 数据库会话管理器 - 支持多连接隔离与极致并发
pub struct ConnectionManager {
    /// 使用 Arc 包裹驱动实例，允许在释放 Map 锁后继续持有驱动
    connections: Arc<RwLock<HashMap<String, Arc<dyn DatabaseOperations>>>>,
    connection_types: Arc<RwLock<HashMap<String, DatabaseType>>>,
    configs: Arc<RwLock<HashMap<String, ConnectionConfig>>>,
    active_queries: Arc<RwLock<HashMap<String, u64>>>,
    cancelled_queries: Arc<RwLock<HashMap<String, u64>>>,
    session_creation_locks: Arc<RwLock<HashMap<String, Arc<Mutex<()>>>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
            connection_types: Arc::new(RwLock::new(HashMap::new())),
            configs: Arc::new(RwLock::new(HashMap::new())),
            active_queries: Arc::new(RwLock::new(HashMap::new())),
            cancelled_queries: Arc::new(RwLock::new(HashMap::new())),
            session_creation_locks: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    fn normalize_composite_id(&self, composite_id: &str) -> String {
        if composite_id.contains(':') {
            composite_id.to_string()
        } else {
            format!("{}:{}", composite_id, DEFAULT_SESSION_ID)
        }
    }

    async fn register_query_start(&self, composite_id: &str, query_id: u64) {
        self.active_queries
            .write()
            .await
            .insert(composite_id.to_string(), query_id);
        self.cancelled_queries.write().await.remove(composite_id);
    }

    async fn is_query_cancelled(&self, composite_id: &str, query_id: u64) -> bool {
        self.cancelled_queries
            .read()
            .await
            .get(composite_id)
            .copied()
            == Some(query_id)
    }

    async fn clear_query_tracking(&self, composite_id: &str, query_id: u64) {
        {
            let mut active_queries = self.active_queries.write().await;
            if active_queries.get(composite_id).copied() == Some(query_id) {
                active_queries.remove(composite_id);
            }
        }

        let mut cancelled_queries = self.cancelled_queries.write().await;
        if cancelled_queries.get(composite_id).copied() == Some(query_id) {
            cancelled_queries.remove(composite_id);
        }
    }

    /// 核心：解析 ID 并获取驱动实例，获取后立即释放锁
    pub async fn get_db_ref(&self, composite_id: &str) -> DbResult<Arc<dyn DatabaseOperations>> {
        let real_id = self.normalize_composite_id(composite_id);

        // 1. 尝试直接获取已存在的连接
        {
            let conns = self.connections.read().await;
            if let Some(db) = conns.get(&real_id) {
                return Ok(db.clone());
            }
        }

        // 2. 如果不存在，触发创建流程 (ensure_session 内部会处理锁)
        debug!(session = %real_id, "会话不存在，触发自动创建流程");
        let config_id = real_id.split(':').next().unwrap_or(composite_id);
        let session_id = real_id.split(':').nth(1).unwrap_or(DEFAULT_SESSION_ID);
        
        self.ensure_session(config_id, session_id).await?;
        
        // 3. 再次获取（此时肯定存在了）
        let conns = self.connections.read().await;
        conns.get(&real_id).cloned().ok_or_else(|| DbError::SessionNotFound(real_id))
    }

    async fn get_session_creation_lock(&self, composite_id: &str) -> Arc<Mutex<()>> {
        if let Some(lock) = self.session_creation_locks.read().await.get(composite_id) {
            return lock.clone();
        }

        let mut locks = self.session_creation_locks.write().await;
        locks
            .entry(composite_id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    #[instrument(skip(self, config_id, session_id))]
    pub async fn ensure_session(
        &self,
        config_id: &str,
        session_id: &str,
    ) -> DbResult<String> {
        let composite_id = format!("{}:{}", config_id, session_id);

        if self.connections.read().await.contains_key(&composite_id) {
            return Ok(composite_id);
        }

        let session_lock = self.get_session_creation_lock(&composite_id).await;
        let _guard = session_lock.lock().await;

        if self.connections.read().await.contains_key(&composite_id) {
            return Ok(composite_id);
        }

        let config = self.configs.read().await.get(config_id).cloned().ok_or_else(|| {
            error!(config_id = %config_id, "未找到配置，请确保已保存连接");
            DbError::ConfigError(format!("配置 {} 不存在", config_id))
        })?;

        let db = self.create_instance(&config.db_type)?;

        debug!(session = %composite_id, "正在发起驱动层连接...");
        db.connect(config.clone()).await?;

        let db = Arc::from(db);
        self.connections
            .write()
            .await
            .insert(composite_id.clone(), db);
        self.connection_types
            .write()
            .await
            .insert(composite_id.clone(), config.db_type.clone());

        info!(session = %composite_id, "物理连接已建立并存入管理器");
        Ok(composite_id)
    }

    pub async fn create_connection(
        &self,
        config: ConnectionConfig,
    ) -> DbResult<String> {
        let config_id = config.id.clone();
        self.configs.write().await.insert(config_id.clone(), config.clone());
        self.ensure_session(&config_id, DEFAULT_SESSION_ID).await
    }

    #[allow(unreachable_patterns)]
    fn create_instance(&self, db_type: &DatabaseType) -> DbResult<Box<dyn DatabaseOperations>> {
        match db_type {
            #[cfg(feature = "mysql")]
            DatabaseType::MySQL => Ok(Box::new(MySqlDatabase::new())),
            #[cfg(feature = "postgresql")]
            DatabaseType::PostgreSQL => Ok(Box::new(super::postgresql::PostgreSqlDatabase::new())),
            #[cfg(feature = "sqlite")]
            DatabaseType::SQLite => Ok(Box::new(super::sqlite::SqliteDatabase::new())),
            #[cfg(feature = "mongodb-support")]
            DatabaseType::MongoDB => Ok(Box::new(super::mongodb::MongoDatabase::new())),
            #[cfg(feature = "redis-support")]
            DatabaseType::Redis => Ok(Box::new(super::redis::RedisDatabase::new())),
            _ => Err(DbError::UnsupportedDatabase),
        }
    }

    pub async fn get_db_instance(&self, composite_id: &str) -> DbResult<Arc<RwLock<HashMap<String, Arc<dyn DatabaseOperations>>>>> {
        self.get_db_ref(composite_id).await?;
        Ok(self.connections.clone())
    }

    pub async fn test_connection(&self, config: &ConnectionConfig) -> DbResult<bool> {
        let db = self.create_instance(&config.db_type)?;
        db.test_connection(config).await
    }

    pub async fn disconnect(&self, config_id: &str) -> DbResult<()> {
        let prefix = format!("{}:", config_id);
        let keys_to_remove = {
            let conns = self.connections.read().await;
            conns
                .keys()
                .filter(|key| key.starts_with(&prefix) || *key == config_id)
                .cloned()
                .collect::<Vec<_>>()
        };

        let dbs_to_disconnect = {
            let mut conns = self.connections.write().await;
            let mut removed = Vec::new();
            for key in &keys_to_remove {
                if let Some(db) = conns.remove(key) {
                    removed.push(db);
                }
            }
            removed
        };

        for db in dbs_to_disconnect {
            db.disconnect().await?;
        }

        self.connection_types
            .write()
            .await
            .retain(|key, _| !keys_to_remove.iter().any(|removed| removed == key));
        self.active_queries
            .write()
            .await
            .retain(|key, _| !keys_to_remove.iter().any(|removed| removed == key));
        self.cancelled_queries
            .write()
            .await
            .retain(|key, _| !keys_to_remove.iter().any(|removed| removed == key));
        self.session_creation_locks
            .write()
            .await
            .retain(|key, _| !keys_to_remove.iter().any(|removed| removed == key));
        self.configs.write().await.remove(config_id);
        Ok(())
    }

    /// 内部辅助：确保驱动当前连接到正确的数据库
    async fn ensure_db_context(&self, db: Arc<dyn DatabaseOperations>, database: Option<&str>) -> DbResult<()> {
        if let Some(db_name) = database {
            db.switch_database(db_name).await?;
        }
        Ok(())
    }

    // --- 代理方法：转发给具体驱动 ---

    pub async fn execute_query(&self, composite_id: &str, sql: &str, database: Option<&str>, query_id: Option<u64>) -> DbResult<Vec<QueryResult>> {
        let real_id = self.normalize_composite_id(composite_id);
        if let Some(query_id) = query_id {
            self.register_query_start(&real_id, query_id).await;
        }

        let result = async {
            let db = self.get_db_ref(&real_id).await?;
            self.ensure_db_context(db.clone(), database).await?;

            if let Some(query_id) = query_id {
                if self.is_query_cancelled(&real_id, query_id).await {
                    return Err(DbError::QueryCancelled);
                }
            }

            db.execute_query(sql, database, query_id).await
        }
        .await;

        let was_cancelled = if let Some(query_id) = query_id {
            self.is_query_cancelled(&real_id, query_id).await
        } else {
            false
        };

        if let Some(query_id) = query_id {
            self.clear_query_tracking(&real_id, query_id).await;
        }

        if was_cancelled {
            Err(DbError::QueryCancelled)
        } else {
            result
        }
    }

    pub async fn get_databases(&self, composite_id: &str) -> DbResult<Vec<DatabaseInfo>> {
        let db = self.get_db_ref(composite_id).await?;
        db.get_databases().await
    }

    pub async fn get_tables(&self, composite_id: &str, database: Option<&str>) -> DbResult<Vec<TableInfo>> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.get_tables(database).await
    }

    pub async fn get_views(&self, composite_id: &str, database: Option<&str>) -> DbResult<Vec<TableInfo>> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.get_views(database).await
    }

    pub async fn get_table_structure(&self, composite_id: &str, table: &str, schema: Option<&str>, database: Option<&str>) -> DbResult<Vec<ColumnInfo>> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.get_table_structure(table, schema, database).await
    }

    pub async fn update_data(&self, composite_id: &str, table: &str, schema: Option<&str>, database: Option<&str>, column: &str, value: Option<String>, where_conditions: HashMap<String, serde_json::Value>) -> DbResult<()> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.update_data(table, schema, column, value, where_conditions).await
    }

    pub async fn insert_data(&self, composite_id: &str, table: &str, schema: Option<&str>, database: Option<&str>, data: HashMap<String, serde_json::Value>) -> DbResult<()> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.insert_data(table, schema, data).await
    }

    pub async fn delete_data(&self, composite_id: &str, table: &str, schema: Option<&str>, database: Option<&str>, where_conditions: HashMap<String, serde_json::Value>) -> DbResult<()> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.delete_data(table, schema, where_conditions).await
    }

    pub async fn truncate_table(&self, composite_id: &str, table: &str, schema: Option<&str>, database: Option<&str>) -> DbResult<()> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.truncate_table(table, schema).await
    }

    pub async fn get_database_type(&self, composite_id: &str) -> DbResult<DatabaseType> {
        let real_id = self.normalize_composite_id(composite_id);
        let config_id = real_id.split(':').next().unwrap_or(composite_id);
        
        if let Some(t) = self.connection_types.read().await.get(&real_id) {
            return Ok(t.clone());
        }
        
        self.configs.read().await.get(config_id).map(|c| c.db_type.clone()).ok_or(DbError::SessionNotFound(real_id))
    }

    pub async fn get_configured_database(&self, composite_id: &str) -> Option<String> {
        let config_id = composite_id.split(':').next().unwrap_or(composite_id);
        self.configs
            .read()
            .await
            .get(config_id)
            .and_then(|config| config.database.clone())
    }

    /// 检查已建立连接的健康状态（轻量 ping）
    pub async fn check_health(&self, composite_id: &str) -> DbResult<bool> {
        let real_id = self.normalize_composite_id(composite_id);
        let db = self.get_db_ref(&real_id).await?;
        db.check_health().await
    }

    pub async fn get_schemas(&self, composite_id: &str, database: Option<&str>) -> DbResult<Vec<SchemaInfo>> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.get_schemas(database).await
    }

    pub async fn get_functions(&self, composite_id: &str, database: Option<&str>, schema: Option<&str>) -> DbResult<Vec<FunctionInfo>> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.get_functions(database, schema).await
    }

    pub async fn get_procedures(&self, composite_id: &str, database: Option<&str>, schema: Option<&str>) -> DbResult<Vec<FunctionInfo>> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.get_procedures(database, schema).await
    }

    pub async fn get_indexes(&self, composite_id: &str, table: &str, schema: Option<&str>) -> DbResult<Vec<IndexInfo>> {
        let db = self.get_db_ref(composite_id).await?;
        db.get_indexes(table, schema).await
    }

    pub async fn get_foreign_keys(&self, composite_id: &str, table: &str, schema: Option<&str>) -> DbResult<Vec<ForeignKeyInfo>> {
        let db = self.get_db_ref(composite_id).await?;
        db.get_foreign_keys(table, schema).await
    }

    pub async fn get_triggers(&self, composite_id: &str, table: &str, schema: Option<&str>, database: Option<&str>) -> DbResult<Vec<TriggerInfo>> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.get_triggers(table, schema, database).await
    }

    pub async fn get_schema_indexes(&self, composite_id: &str, database: Option<&str>, schema: Option<&str>) -> DbResult<Vec<IndexInfo>> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.get_schema_indexes(database, schema).await
    }

    pub async fn get_aggregate_functions(&self, composite_id: &str, database: Option<&str>, schema: Option<&str>) -> DbResult<Vec<FunctionInfo>> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.get_aggregate_functions(database, schema).await
    }

    pub async fn get_table_ddl(&self, composite_id: &str, table: &str, schema: Option<&str>, database: Option<&str>) -> DbResult<String> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.get_table_ddl(table, schema).await
    }

    pub async fn get_view_definition(&self, composite_id: &str, view: &str, schema: Option<&str>, database: Option<&str>) -> DbResult<String> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.get_view_definition(view, schema).await
    }

    pub async fn get_extensions(&self, composite_id: &str, database: Option<&str>) -> DbResult<Vec<ExtensionInfo>> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.get_extensions(database).await
    }

    pub async fn alter_table(&self, composite_id: &str, table: &str, schema: Option<&str>, database: Option<&str>, changes: Vec<TableChange>) -> DbResult<()> {
        let db = self.get_db_ref(composite_id).await?;
        self.ensure_db_context(db.clone(), database).await?;
        db.alter_table(table, schema, database, changes).await
    }

    pub async fn explain_query(&self, composite_id: &str, sql: &str, database: Option<&str>, query_id: Option<u64>) -> DbResult<Vec<QueryResult>> {
        let real_id = self.normalize_composite_id(composite_id);
        if let Some(query_id) = query_id {
            self.register_query_start(&real_id, query_id).await;
        }

        let result = async {
            let db = self.get_db_ref(&real_id).await?;
            self.ensure_db_context(db.clone(), database).await?;

            if let Some(query_id) = query_id {
                if self.is_query_cancelled(&real_id, query_id).await {
                    return Err(DbError::QueryCancelled);
                }
            }

            db.explain_query(sql, database, query_id).await
        }
        .await;

        let was_cancelled = if let Some(query_id) = query_id {
            self.is_query_cancelled(&real_id, query_id).await
        } else {
            false
        };

        if let Some(query_id) = query_id {
            self.clear_query_tracking(&real_id, query_id).await;
        }

        if was_cancelled {
            Err(DbError::QueryCancelled)
        } else {
            result
        }
    }

    pub async fn cancel_query(&self, composite_id: &str, query_id: u64) -> DbResult<bool> {
        let real_id = self.normalize_composite_id(composite_id);
        let db = self.get_db_ref(&real_id).await?;
        let active_query_id = self
            .active_queries
            .read()
            .await
            .get(&real_id)
            .copied();
        let should_cancel = active_query_id == Some(query_id);

        info!(
            session = %real_id,
            query_id = query_id,
            active_query_id = ?active_query_id,
            should_cancel = should_cancel,
            "连接管理器收到取消请求"
        );

        if !should_cancel {
            warn!(
                session = %real_id,
                query_id = query_id,
                active_query_id = ?active_query_id,
                "取消请求未命中活动查询"
            );
            return Ok(false);
        }

        self.cancelled_queries
            .write()
            .await
            .insert(real_id.clone(), query_id);
        let cancelled = db.cancel_query(query_id).await?;

        info!(
            session = %real_id,
            query_id = query_id,
            cancelled = cancelled,
            "连接管理器已完成驱动取消调用"
        );

        Ok(cancelled)
    }

    pub async fn execute_query_batch(&self, composite_id: &str, sqls: &[String], database: Option<&str>, query_id: Option<u64>) -> DbResult<BatchExecutionResult> {
        let start = Instant::now();
        let real_id = self.normalize_composite_id(composite_id);
        if let Some(query_id) = query_id {
            self.register_query_start(&real_id, query_id).await;
        }

        let result = async {
            let db = self.get_db_ref(&real_id).await?;
            self.ensure_db_context(db.clone(), database).await?;

            let mut results = Vec::new();
            let mut statements_succeeded = 0usize;
            let mut all_messages: Vec<DbMessage> = Vec::new();

            for (index, sql) in sqls.iter().enumerate() {
                if let Some(query_id) = query_id {
                    if self.is_query_cancelled(&real_id, query_id).await {
                        return Ok(BatchExecutionResult {
                            results,
                            statements_total: sqls.len(),
                            statements_succeeded,
                            failed_statement_index: None,
                            error_message: None,
                            was_cancelled: true,
                            execution_time_ms: start.elapsed().as_millis(),
                            messages: all_messages,
                        });
                    }
                }

                match db.execute_query(sql, database, query_id).await {
                    Ok(res_vec) => {
                        statements_succeeded += 1;
                        for res in &res_vec {
                            all_messages.extend(res.messages.clone());
                        }
                        results.extend(res_vec);
                    }
                    Err(DbError::QueryCancelled) => {
                        return Ok(BatchExecutionResult {
                            results,
                            statements_total: sqls.len(),
                            statements_succeeded,
                            failed_statement_index: None,
                            error_message: None,
                            was_cancelled: true,
                            execution_time_ms: start.elapsed().as_millis(),
                            messages: all_messages,
                        });
                    }
                    Err(error) => {
                        return Ok(BatchExecutionResult {
                            results,
                            statements_total: sqls.len(),
                            statements_succeeded,
                            failed_statement_index: Some(index + 1),
                            error_message: Some(error.to_string()),
                            was_cancelled: false,
                            execution_time_ms: start.elapsed().as_millis(),
                            messages: all_messages,
                        });
                    }
                }
            }

            Ok(BatchExecutionResult {
                results,
                statements_total: sqls.len(),
                statements_succeeded,
                failed_statement_index: None,
                error_message: None,
                was_cancelled: false,
                execution_time_ms: start.elapsed().as_millis(),
                messages: all_messages,
            })
        }
        .await;

        if let Some(query_id) = query_id {
            self.clear_query_tracking(&real_id, query_id).await;
        }

        result
    }
}

impl Default for ConnectionManager {
    fn default() -> Self { Self::new() }
}
