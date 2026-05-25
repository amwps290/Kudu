use async_trait::async_trait;
use std::collections::HashMap;
use std::time::Instant;
use mysql_async::{prelude::*, Conn, Pool, Opts, Row, Value, OptsBuilder, Error as MySqlError};
use tokio::sync::Mutex;
use tracing::{info, instrument, debug, error};

use super::traits::*;
use super::sql_helpers::{build_where_clause, ParamStyle};
use crate::utils::sql_sanitize::{escape_mysql_id, escape_string_literal};
use crate::utils::sql_script::split_sql_script;

/// MySQL 数据库驱动状态
struct ActiveMySqlQuery {
    query_id: u64,
    connection_id: u32,
}

struct MySqlState {
    pool: Option<Pool>,
    config: Option<ConnectionConfig>,
    active_query: Option<ActiveMySqlQuery>,
}

/// MySQL 数据库驱动 - 基于 mysql_async 的原生实现
pub struct MySqlDatabase {
    state: Mutex<MySqlState>,
}

impl MySqlDatabase {
    pub fn new() -> Self {
        Self { 
            state: Mutex::new(MySqlState { pool: None, config: None, active_query: None })
        }
    }

    fn create_opts(config: &ConnectionConfig) -> Opts {
        let builder = OptsBuilder::default()
            .ip_or_hostname(config.host.clone())
            .tcp_port(config.port)
            .user(Some(config.username.clone()))
            .pass(Some(config.password.clone()))
            .db_name(config.database.as_deref())
            .prefer_socket(false)
            .tcp_keepalive(Some(60000u32));
        
        builder.into()
    }

    /// 获取用户配置的超时秒数（默认 5 秒）
    fn timeout_duration(config: &ConnectionConfig) -> std::time::Duration {
        let secs = if config.connection_timeout > 0 { config.connection_timeout } else { 5 };
        std::time::Duration::from_secs(secs)
    }

    fn json_to_mysql_value(value: &serde_json::Value) -> mysql_async::Value {
        match value {
            serde_json::Value::Null => mysql_async::Value::NULL,
            serde_json::Value::Bool(v) => mysql_async::Value::from(if *v { 1_i8 } else { 0_i8 }),
            serde_json::Value::Number(n) => {
                if let Some(v) = n.as_i64() {
                    mysql_async::Value::from(v)
                } else if let Some(v) = n.as_u64() {
                    mysql_async::Value::from(v)
                } else if let Some(v) = n.as_f64() {
                    mysql_async::Value::from(v)
                } else {
                    mysql_async::Value::NULL
                }
            }
            serde_json::Value::String(v) => mysql_async::Value::from(v.clone()),
            serde_json::Value::Array(_) | serde_json::Value::Object(_) => mysql_async::Value::from(value.to_string()),
        }
    }

    fn build_column_type(column: &ColumnInfo) -> String {
        if column.data_type.contains('(') {
            return column.data_type.clone();
        }

        match column.data_type.to_uppercase().as_str() {
            "CHAR" | "VARCHAR" => {
                if let Some(length) = column.character_maximum_length {
                    format!("{}({})", column.data_type, length)
                } else {
                    column.data_type.clone()
                }
            }
            "DECIMAL" => {
                match (column.numeric_precision, column.numeric_scale) {
                    (Some(precision), Some(scale)) => format!("{}({},{})", column.data_type, precision, scale),
                    _ => column.data_type.clone(),
                }
            }
            _ => column.data_type.clone(),
        }
    }

    fn build_column_definition(column: &ColumnInfo) -> String {
        let mut part = format!("{} {}", escape_mysql_id(&column.name), Self::build_column_type(column));
        if !column.nullable {
            part.push_str(" NOT NULL");
        }
        if let Some(ref d) = column.default_value {
            part.push_str(&format!(" DEFAULT '{}'", d.replace("'", "''")));
        }
        if column.is_auto_increment {
            part.push_str(" AUTO_INCREMENT");
        }
        if let Some(ref c) = column.comment {
            part.push_str(&format!(" COMMENT '{}'", c.replace("'", "''")));
        }
        part
    }

    fn format_mysql_error(error: MySqlError) -> String {
        match error {
            MySqlError::Server(server_error) => {
                format!(
                    "ERROR {} ({}): {}",
                    server_error.code,
                    server_error.state,
                    server_error.message
                )
            }
            other => other.to_string(),
        }
    }

    fn sanitize_mysql_charset(charset: &str) -> String {
        let cleaned = charset
            .chars()
            .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '_')
            .collect::<String>();

        if cleaned.is_empty() {
            "utf8mb4".to_string()
        } else {
            cleaned
        }
    }

    async fn configure_connection(conn: &mut Conn, config: &ConnectionConfig) -> DbResult<()> {
        if config.db_type != DatabaseType::MySQL {
            return Ok(());
        }

        let charset = config
            .mysql_charset
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .map(Self::sanitize_mysql_charset)
            .unwrap_or_else(|| "utf8mb4".to_string());

        conn.query_drop(format!("SET NAMES {}", charset))
            .await
            .map_err(|e| DbError::QueryFailed(Self::format_mysql_error(e)))?;

        if let Some(init_sql) = config.mysql_init_sql.as_deref().map(str::trim).filter(|sql| !sql.is_empty()) {
            conn.query_drop(init_sql)
                .await
                .map_err(|e| DbError::QueryFailed(Self::format_mysql_error(e)))?;
        }

        Ok(())
    }

    async fn get_pool_and_config(&self) -> DbResult<(Pool, ConnectionConfig)> {
        let state = self.state.lock().await;
        let pool = state.pool.as_ref().ok_or(DbError::not_connected())?.clone();
        let config = state.config.clone().ok_or_else(|| DbError::ConfigError("未找到连接配置".into()))?;
        Ok((pool, config))
    }

    async fn set_active_query(&self, query_id: u64, connection_id: u32) {
        let mut state = self.state.lock().await;
        state.active_query = Some(ActiveMySqlQuery { query_id, connection_id });
    }

    async fn clear_active_query(&self, query_id: u64) {
        let mut state = self.state.lock().await;
        if state.active_query.as_ref().map(|query| query.query_id) == Some(query_id) {
            state.active_query = None;
        }
    }

    async fn get_cancel_target(&self, query_id: u64) -> DbResult<Option<(ConnectionConfig, u32)>> {
        let state = self.state.lock().await;
        let Some(active_query) = state.active_query.as_ref() else {
            return Ok(None);
        };

        if active_query.query_id != query_id {
            return Ok(None);
        }

        let config = state
            .config
            .clone()
            .ok_or_else(|| DbError::ConfigError("未找到连接配置".into()))?;
        Ok(Some((config, active_query.connection_id)))
    }

    async fn resolve_database_name(&self, database: Option<&str>, schema: Option<&str>) -> DbResult<String> {
        if let Some(name) = schema.or(database) {
            return Ok(name.to_string());
        }

        let state = self.state.lock().await;
        state
            .config
            .as_ref()
            .and_then(|config| config.database.clone())
            .ok_or_else(|| DbError::ConfigError("MySQL 需要指定数据库".into()))
    }
}

#[async_trait]
impl DatabaseOperations for MySqlDatabase {
    async fn test_connection(&self, config: &ConnectionConfig) -> DbResult<bool> {
        let timeout = Self::timeout_duration(config);
        let opts = Self::create_opts(config);
        let pool = Pool::new(opts);
        
        let result = tokio::time::timeout(timeout, async {
            let mut conn = pool.get_conn().await.map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
            Self::configure_connection(&mut conn, config).await?;
            conn.query_drop("SELECT 1").await.map_err(|e| DbError::QueryFailed(Self::format_mysql_error(e)))?;
            Ok::<_, DbError>(true)
        }).await;

        pool.disconnect().await.ok();

        match result {
            Ok(Ok(true)) => Ok(true),
            Ok(Ok(false)) => Err(DbError::ConnectionFailed("连接测试返回失败".into())),
            Ok(Err(e)) => {
                error!("MySQL 连接测试失败: {}", e);
                Err(e)
            }
            Err(_elapsed) => {
                let msg = format!("连接超时 ({}s)", timeout.as_secs());
                error!("MySQL 连接测试超时: {}", msg);
                Err(DbError::ConnectionFailed(msg))
            }
        }
    }

    async fn connect(&self, config: ConnectionConfig) -> DbResult<()> {
        let opts = Self::create_opts(&config);
        let pool = Pool::new(opts);
        
        // 尝试获取一个连接以验证配置是否真的可用
        let mut conn = pool.get_conn().await.map_err(|e| DbError::ConnectionFailed(format!("无法建立初始连接: {}", e)))?;
        Self::configure_connection(&mut conn, &config).await?;
        
        let mut state = self.state.lock().await;
        state.pool = Some(pool);
        state.config = Some(config);
        Ok(())
    }

    async fn disconnect(&self) -> DbResult<()> {
        let mut state = self.state.lock().await;
        if let Some(pool) = state.pool.take() {
            pool.disconnect().await.map_err(|e| DbError::Other(e.to_string()))?;
        }
        state.config = None;
        state.active_query = None;
        Ok(())
    }

    async fn check_health(&self) -> DbResult<bool> {
        let state = self.state.lock().await;
        let pool = state.pool.as_ref().ok_or(DbError::not_connected())?;
        let mut conn = pool.get_conn().await.map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        conn.query_drop("SELECT 1").await.map_err(|e| DbError::QueryFailed(Self::format_mysql_error(e)))?;
        Ok(true)
    }

    async fn switch_database(&self, database: &str) -> DbResult<()> {
        let mut state = self.state.lock().await;
        let mut config = state.config.clone().ok_or(DbError::Other("未找到初始配置".into()))?;
        
        if config.database.as_deref() == Some(database) {
            return Ok(());
        }
        
        info!(new_db = %database, "MySQL 正在重连以切换数据库...");
        config.database = Some(database.to_string());
        
        let opts = Self::create_opts(&config);
        let pool = Pool::new(opts);
        
        if let Some(old_pool) = state.pool.replace(pool) {
            tokio::spawn(async move { old_pool.disconnect().await.ok(); });
        }
        state.config = Some(config);
        Ok(())
    }

    #[instrument(skip(self, sql))]
    async fn execute_query(&self, sql: &str, _database: Option<&str>, query_id: Option<u64>) -> DbResult<Vec<QueryResult>> {
        let _start_total = Instant::now();
        let (pool, config) = self.get_pool_and_config().await?;
        let mut conn = pool.get_conn().await.map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        Self::configure_connection(&mut conn, &config).await?;

        if let Some(query_id) = query_id {
            self.set_active_query(query_id, conn.id()).await;
        }

        debug!(sql = %sql.replace('\n', " "), "执行 MySQL 查询");

        let result = async {
            let sqls = split_sql_script(sql, &DatabaseType::MySQL);
            let mut results = Vec::new();

            for statement in sqls {
                let start_stmt = Instant::now();
                let rows: Vec<Row> = conn.query(statement.sql.as_str()).await.map_err(|e| DbError::QueryFailed(Self::format_mysql_error(e)))?;
                
                let mut columns = Vec::new();
                if let Some(first_row) = rows.first() {
                    columns = first_row.columns().iter().map(|c| c.name_str().to_string()).collect();
                }
                
                let mut final_rows = Vec::new();
                for row in rows {
                    let mut row_map = HashMap::new();
                    for (i, col_name) in columns.iter().enumerate() {
                        let value: Value = row.get(i).unwrap_or(Value::NULL);
                        let json_val = match value {
                            Value::NULL => serde_json::Value::Null,
                            Value::Bytes(b) => serde_json::Value::String(String::from_utf8_lossy(&b).into_owned()),
                            Value::Int(i) => serde_json::Value::Number(i.into()),
                            Value::UInt(u) => serde_json::Value::Number(u.into()),
                            Value::Float(f) => serde_json::Value::Number(serde_json::Number::from_f64(f as f64).unwrap_or(serde_json::Number::from(0))),
                            Value::Double(d) => serde_json::Value::Number(serde_json::Number::from_f64(d).unwrap_or(serde_json::Number::from(0))),
                            Value::Date(y, m, d, h, i, s, ms) => serde_json::Value::String(format!("{}-{:02}-{:02} {:02}:{:02}:{:02}.{:03}", y, m, d, h, i, s, ms)),
                            Value::Time(neg, d, h, m, s, ms) => serde_json::Value::String(format!("{}{}:{:02}:{:02}:{:02}.{:03}", if neg { "-" } else { "" }, d, h, m, s, ms)),
                        };
                        row_map.insert(col_name.clone(), json_val);
                    }
                    final_rows.push(row_map);
                }
                
                results.push(QueryResult {
                    columns,
                    rows: final_rows,
                    affected_rows: conn.affected_rows(),
                    execution_time_ms: start_stmt.elapsed().as_millis(),
                    messages: Vec::new(),
                });
            }

            if results.is_empty() {
                results.push(QueryResult::empty(0));
            }

            Ok(results)
        }
        .await;

        if let Some(query_id) = query_id {
            self.clear_active_query(query_id).await;
        }

        result
    }

    async fn get_databases(&self) -> DbResult<Vec<DatabaseInfo>> {
        let results = self.execute_query("SHOW DATABASES", None, None).await?;
        if let Some(res) = results.first() {
            Ok(res.rows.iter().map(|r| DatabaseInfo { 
                name: r.values().next().and_then(|v| v.as_str()).unwrap_or("").to_string(), 
                charset: None, collation: None 
            }).collect())
        } else {
            Ok(vec![])
        }
    }

    async fn get_tables(&self, database: Option<&str>) -> DbResult<Vec<TableInfo>> {
        let sql = if let Some(db) = database {
            format!("SELECT TABLE_NAME, TABLE_COMMENT, TABLE_ROWS, COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0) AS TOTAL_LENGTH, TABLE_SCHEMA FROM information_schema.TABLES WHERE TABLE_SCHEMA = {} AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME", escape_string_literal(db))
        } else {
            "SHOW TABLES".to_string()
        };
        
        let results = self.execute_query(&sql, None, None).await?;
        if let Some(res) = results.first() {
            Ok(res.rows.iter().map(|r| TableInfo {
                name: r.get("TABLE_NAME").or_else(|| r.values().next()).and_then(|v| v.as_str()).unwrap_or("").to_string(),
                schema: r.get("TABLE_SCHEMA").and_then(|v| v.as_str()).map(|s| s.to_string()),
                table_type: "TABLE".into(),
                engine: None,
                rows: r.get("TABLE_ROWS").and_then(|v| v.as_u64()),
                size_mb: r.get("TOTAL_LENGTH").and_then(|v| v.as_f64()).map(|s| s / 1024.0 / 1024.0),
                comment: r.get("TABLE_COMMENT").and_then(|v| v.as_str()).map(|s| s.to_string()),
            }).collect())
        } else {
            Ok(vec![])
        }
    }

    async fn get_views(&self, database: Option<&str>) -> DbResult<Vec<TableInfo>> {
        let target_db = self.resolve_database_name(database, None).await?;
        let sql = format!(
            "SELECT TABLE_NAME, TABLE_COMMENT, TABLE_SCHEMA FROM information_schema.TABLES WHERE TABLE_SCHEMA = {} AND TABLE_TYPE = 'VIEW' ORDER BY TABLE_NAME",
            escape_string_literal(&target_db)
        );

        let results = self.execute_query(&sql, None, None).await?;
        if let Some(res) = results.first() {
            Ok(res.rows.iter().map(|r| TableInfo {
                name: r.get("TABLE_NAME").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                schema: r.get("TABLE_SCHEMA").and_then(|v| v.as_str()).map(|s| s.to_string()),
                table_type: "VIEW".into(),
                engine: None,
                rows: None,
                size_mb: None,
                comment: r.get("TABLE_COMMENT").and_then(|v| v.as_str()).map(|s| s.to_string()),
            }).collect())
        } else {
            Ok(vec![])
        }
    }

    async fn get_table_structure(&self, table: &str, _schema: Option<&str>, database: Option<&str>) -> DbResult<Vec<ColumnInfo>> {
        let schema = database.unwrap_or("");
        let sql = format!("SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, COLUMN_COMMENT, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE FROM information_schema.COLUMNS WHERE TABLE_NAME = {} AND TABLE_SCHEMA = {} ORDER BY ORDINAL_POSITION", escape_string_literal(table), escape_string_literal(schema));
        
        let results = self.execute_query(&sql, None, None).await?;
        if let Some(res) = results.first() {
            Ok(res.rows.iter().map(|r| {
                let key = r.get("COLUMN_KEY").and_then(|v| v.as_str()).unwrap_or("");
                ColumnInfo {
                    name: r.get("COLUMN_NAME").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    data_type: r.get("DATA_TYPE").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    nullable: r.get("IS_NULLABLE").and_then(|v| v.as_str()) == Some("YES"),
                    default_value: r.get("COLUMN_DEFAULT").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    is_primary_key: key == "PRI",
                    is_auto_increment: r.get("EXTRA").and_then(|v| v.as_str()).unwrap_or("").contains("auto_increment"),
                    comment: r.get("COLUMN_COMMENT").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    character_maximum_length: r.get("CHARACTER_MAXIMUM_LENGTH").and_then(|v| v.as_i64()),
                    numeric_precision: r.get("NUMERIC_PRECISION").and_then(|v| v.as_i64()),
                    numeric_scale: r.get("NUMERIC_SCALE").and_then(|v| v.as_i64()),
                }
            }).collect())
        } else {
            Ok(vec![])
        }
    }

    async fn update_data(&self, table: &str, _schema: Option<&str>, column: &str, value: Option<String>, where_conditions: HashMap<String, serde_json::Value>) -> DbResult<()> {
        let (pool, config) = self.get_pool_and_config().await?;
        let mut conn = pool.get_conn().await.map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        Self::configure_connection(&mut conn, &config).await?;

        let wc = build_where_clause(&where_conditions, escape_mysql_id, ParamStyle::QuestionMark);

        let mut p_vec = Vec::new();
        p_vec.push(mysql_async::Value::from(value));
        for pv in &wc.param_values {
            p_vec.push(mysql_async::Value::from(pv.clone()));
        }

        let params = mysql_async::Params::Positional(p_vec);
        let sql = format!("UPDATE {} SET {} = ? WHERE {}", escape_mysql_id(table), escape_mysql_id(column), wc.sql);

        conn.exec_drop(sql, params).await.map_err(|e| DbError::QueryFailed(Self::format_mysql_error(e)))?;
        Ok(())
    }

    async fn insert_data(&self, table: &str, _schema: Option<&str>, data: HashMap<String, serde_json::Value>) -> DbResult<()> {
        if data.is_empty() {
            return Err(DbError::ConfigError("插入数据不能为空".into()));
        }

        let (pool, config) = self.get_pool_and_config().await?;
        let mut conn = pool.get_conn().await.map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        Self::configure_connection(&mut conn, &config).await?;

        let mut entries: Vec<(String, serde_json::Value)> = data.into_iter().collect();
        entries.sort_by(|a, b| a.0.cmp(&b.0));

        let columns = entries.iter().map(|(name, _)| escape_mysql_id(name)).collect::<Vec<_>>().join(", ");
        let placeholders = std::iter::repeat_n("?", entries.len()).collect::<Vec<_>>().join(", ");
        let params = mysql_async::Params::Positional(
            entries.iter().map(|(_, value)| Self::json_to_mysql_value(value)).collect(),
        );

        let sql = format!("INSERT INTO {} ({}) VALUES ({})", escape_mysql_id(table), columns, placeholders);
        debug!(sql = %sql, "执行 MySQL 参数化插入");

        conn.exec_drop(sql, params).await.map_err(|e| DbError::QueryFailed(Self::format_mysql_error(e)))?;
        Ok(())
    }

    async fn delete_data(&self, table: &str, _schema: Option<&str>, where_conditions: HashMap<String, serde_json::Value>) -> DbResult<()> {
        let (pool, config) = self.get_pool_and_config().await?;
        let mut conn = pool.get_conn().await.map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        Self::configure_connection(&mut conn, &config).await?;

        let wc = build_where_clause(&where_conditions, escape_mysql_id, ParamStyle::QuestionMark);

        let mut p_vec = Vec::new();
        for pv in &wc.param_values {
            p_vec.push(mysql_async::Value::from(pv.clone()));
        }

        let sql = format!("DELETE FROM {} WHERE {}", escape_mysql_id(table), wc.sql);
        conn.exec_drop(sql, mysql_async::Params::Positional(p_vec)).await.map_err(|e| DbError::QueryFailed(Self::format_mysql_error(e)))?;
        Ok(())
    }

    async fn truncate_table(&self, table: &str, _schema: Option<&str>) -> DbResult<()> {
        let (pool, config) = self.get_pool_and_config().await?;
        let mut conn = pool.get_conn().await.map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        Self::configure_connection(&mut conn, &config).await?;

        let sql = format!("TRUNCATE TABLE {}", escape_mysql_id(table));
        debug!(sql = %sql, "执行 MySQL 清空表");
        conn.query_drop(&sql).await.map_err(|e| DbError::QueryFailed(Self::format_mysql_error(e)))?;
        Ok(())
    }

    async fn get_indexes(&self, table: &str, _schema: Option<&str>) -> DbResult<Vec<IndexInfo>> {
        let results = self.execute_query(&format!("SHOW INDEX FROM {}", escape_mysql_id(table)), None, None).await?;
        let mut map: HashMap<String, IndexInfo> = HashMap::new();
        
        if let Some(res) = results.first() {
            for r in &res.rows {
                let name = r.get("Key_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let col = r.get("Column_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let non_unique = r.get("Non_unique").and_then(|v| v.as_i64()).unwrap_or(1);
                
                let entry = map.entry(name.clone()).or_insert(IndexInfo {
                    name,
                    columns: vec![],
                    is_unique: non_unique == 0,
                    is_primary: r.get("Key_name").and_then(|v| v.as_str()) == Some("PRIMARY"),
                    index_type: r.get("Index_type").and_then(|v| v.as_str()).unwrap_or("BTREE").to_string(),
                    size_bytes: None,
                    include_columns: None,
                    predicate: None,
                });
                entry.columns.push(col);
            }
        }
        Ok(map.into_values().collect())
    }

    async fn get_schemas(&self, database: Option<&str>) -> DbResult<Vec<SchemaInfo>> {
        if let Some(database_name) = database {
            return Ok(vec![SchemaInfo {
                name: database_name.to_string(),
                owner: None,
                comment: None,
            }]);
        }

        let sql = "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME";
        let results = self.execute_query(sql, None, None).await?;
        if let Some(res) = results.first() {
            Ok(res.rows.iter().map(|r| SchemaInfo {
                name: r.get("SCHEMA_NAME").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                owner: None,
                comment: None,
            }).collect())
        } else {
            Ok(vec![])
        }
    }

    async fn get_functions(&self, database: Option<&str>, schema: Option<&str>) -> DbResult<Vec<FunctionInfo>> {
        let target_schema = self.resolve_database_name(database, schema).await?;
        let sql = format!(
            "SELECT r.ROUTINE_NAME, r.ROUTINE_SCHEMA, r.DTD_IDENTIFIER AS RETURN_TYPE, \
             GROUP_CONCAT(CASE \
               WHEN p.PARAMETER_MODE IS NULL THEN NULL \
               WHEN p.PARAMETER_NAME IS NULL OR p.PARAMETER_NAME = '' THEN CONCAT(p.PARAMETER_MODE, ' ', COALESCE(p.DTD_IDENTIFIER, p.DATA_TYPE, '')) \
               ELSE CONCAT(p.PARAMETER_MODE, ' ', p.PARAMETER_NAME, ' ', COALESCE(p.DTD_IDENTIFIER, p.DATA_TYPE, '')) \
             END ORDER BY p.ORDINAL_POSITION SEPARATOR ', ') AS ARGUMENTS, \
             r.ROUTINE_BODY, r.ROUTINE_COMMENT \
             FROM information_schema.ROUTINES r \
             LEFT JOIN information_schema.PARAMETERS p \
               ON p.SPECIFIC_SCHEMA = r.ROUTINE_SCHEMA \
              AND p.SPECIFIC_NAME = r.SPECIFIC_NAME \
              AND p.ORDINAL_POSITION > 0 \
             WHERE r.ROUTINE_SCHEMA = {} AND r.ROUTINE_TYPE = 'FUNCTION' \
             GROUP BY r.ROUTINE_NAME, r.ROUTINE_SCHEMA, r.DTD_IDENTIFIER, r.ROUTINE_BODY, r.ROUTINE_COMMENT \
             ORDER BY r.ROUTINE_NAME",
            escape_string_literal(&target_schema)
        );

        let results = self.execute_query(&sql, None, None).await?;
        if let Some(res) = results.first() {
            Ok(res.rows.iter().map(|r| FunctionInfo {
                oid: None,
                name: r.get("ROUTINE_NAME").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                schema: r.get("ROUTINE_SCHEMA").and_then(|v| v.as_str()).map(|s| s.to_string()),
                return_type: r.get("RETURN_TYPE").and_then(|v| v.as_str()).map(|s| s.to_string()),
                arguments: r.get("ARGUMENTS").and_then(|v| v.as_str()).map(|s| s.to_string()),
                identity_arguments: r.get("ARGUMENTS").and_then(|v| v.as_str()).map(|s| s.to_string()),
                language: r.get("ROUTINE_BODY").and_then(|v| v.as_str()).map(|s| s.to_string()),
                function_type: "function".into(),
                comment: r.get("ROUTINE_COMMENT").and_then(|v| v.as_str()).map(|s| s.to_string()),
            }).collect())
        } else {
            Ok(vec![])
        }
    }

    async fn get_procedures(&self, database: Option<&str>, schema: Option<&str>) -> DbResult<Vec<FunctionInfo>> {
        let target_schema = self.resolve_database_name(database, schema).await?;
        let sql = format!(
            "SELECT r.ROUTINE_NAME, r.ROUTINE_SCHEMA, \
             GROUP_CONCAT(CASE \
               WHEN p.PARAMETER_MODE IS NULL THEN NULL \
               WHEN p.PARAMETER_NAME IS NULL OR p.PARAMETER_NAME = '' THEN CONCAT(p.PARAMETER_MODE, ' ', COALESCE(p.DTD_IDENTIFIER, p.DATA_TYPE, '')) \
               ELSE CONCAT(p.PARAMETER_MODE, ' ', p.PARAMETER_NAME, ' ', COALESCE(p.DTD_IDENTIFIER, p.DATA_TYPE, '')) \
             END ORDER BY p.ORDINAL_POSITION SEPARATOR ', ') AS ARGUMENTS, \
             r.ROUTINE_BODY, r.ROUTINE_COMMENT \
             FROM information_schema.ROUTINES r \
             LEFT JOIN information_schema.PARAMETERS p \
               ON p.SPECIFIC_SCHEMA = r.ROUTINE_SCHEMA \
              AND p.SPECIFIC_NAME = r.SPECIFIC_NAME \
              AND p.ORDINAL_POSITION > 0 \
             WHERE r.ROUTINE_SCHEMA = {} AND r.ROUTINE_TYPE = 'PROCEDURE' \
             GROUP BY r.ROUTINE_NAME, r.ROUTINE_SCHEMA, r.ROUTINE_BODY, r.ROUTINE_COMMENT \
             ORDER BY r.ROUTINE_NAME",
            escape_string_literal(&target_schema)
        );

        let results = self.execute_query(&sql, None, None).await?;
        if let Some(res) = results.first() {
            Ok(res.rows.iter().map(|r| FunctionInfo {
                oid: None,
                name: r.get("ROUTINE_NAME").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                schema: r.get("ROUTINE_SCHEMA").and_then(|v| v.as_str()).map(|s| s.to_string()),
                return_type: None,
                arguments: r.get("ARGUMENTS").and_then(|v| v.as_str()).map(|s| s.to_string()),
                identity_arguments: r.get("ARGUMENTS").and_then(|v| v.as_str()).map(|s| s.to_string()),
                language: r.get("ROUTINE_BODY").and_then(|v| v.as_str()).map(|s| s.to_string()),
                function_type: "procedure".into(),
                comment: r.get("ROUTINE_COMMENT").and_then(|v| v.as_str()).map(|s| s.to_string()),
            }).collect())
        } else {
            Ok(vec![])
        }
    }

    async fn get_foreign_keys(&self, table: &str, _schema: Option<&str>) -> DbResult<Vec<ForeignKeyInfo>> {
        let sql = format!(
            "SELECT kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME, rc.UPDATE_RULE, rc.DELETE_RULE FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA WHERE kcu.TABLE_NAME = {} AND kcu.REFERENCED_TABLE_NAME IS NOT NULL",
            escape_string_literal(table)
        );
        let results = self.execute_query(&sql, None, None).await?;
        let mut fks = Vec::new();
        if let Some(res) = results.first() {
            for r in &res.rows {
                fks.push(ForeignKeyInfo {
                    name: r.get("CONSTRAINT_NAME").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                    column_name: r.get("COLUMN_NAME").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                    referenced_table_name: r.get("REFERENCED_TABLE_NAME").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                    referenced_column_name: r.get("REFERENCED_COLUMN_NAME").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                    update_rule: r.get("UPDATE_RULE").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    delete_rule: r.get("DELETE_RULE").and_then(|v| v.as_str()).map(|s| s.to_string()),
                });
            }
        }
        Ok(fks)
    }

    async fn get_triggers(&self, table: &str, schema: Option<&str>, database: Option<&str>) -> DbResult<Vec<TriggerInfo>> {
        let target_schema = self.resolve_database_name(database, schema).await?;
        let sql = format!(
            "SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION, ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = {} AND EVENT_OBJECT_TABLE = {} ORDER BY TRIGGER_NAME",
            escape_string_literal(&target_schema),
            escape_string_literal(table)
        );
        let results = self.execute_query(&sql, None, None).await?;
        if let Some(res) = results.first() {
            Ok(res.rows.iter().map(|r| TriggerInfo {
                name: r.get("TRIGGER_NAME").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                table_name: r.get("EVENT_OBJECT_TABLE").and_then(|v| v.as_str()).unwrap_or(table).to_string(),
                timing: r.get("ACTION_TIMING").and_then(|v| v.as_str()).map(|s| s.to_string()),
                event: r.get("EVENT_MANIPULATION").and_then(|v| v.as_str()).map(|s| s.to_string()),
                enabled: None,
                definition: r.get("ACTION_STATEMENT").and_then(|v| v.as_str()).map(|s| s.to_string()),
            }).collect())
        } else {
            Ok(vec![])
        }
    }

    async fn get_table_constraints(&self, table: &str, schema: Option<&str>, database: Option<&str>) -> DbResult<Vec<TableConstraintInfo>> {
        let target_schema = self.resolve_database_name(database, schema).await?;
        let unique_sql = format!(
            "SELECT tc.CONSTRAINT_NAME, GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION SEPARATOR ', ') AS COLUMNS \
             FROM information_schema.TABLE_CONSTRAINTS tc \
             LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu \
               ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA \
              AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME \
              AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA \
              AND kcu.TABLE_NAME = tc.TABLE_NAME \
             WHERE tc.TABLE_SCHEMA = {} AND tc.TABLE_NAME = {} AND tc.CONSTRAINT_TYPE = 'UNIQUE' \
             GROUP BY tc.CONSTRAINT_NAME \
             ORDER BY tc.CONSTRAINT_NAME",
            escape_string_literal(&target_schema),
            escape_string_literal(table)
        );

        let mut constraints = Vec::new();
        let unique_results = self.execute_query(&unique_sql, None, None).await?;
        if let Some(res) = unique_results.first() {
            for r in &res.rows {
                let columns = r.get("COLUMNS")
                    .and_then(|v| v.as_str())
                    .map(|s| s.split(',').map(|item| item.trim().to_string()).filter(|item| !item.is_empty()).collect::<Vec<_>>())
                    .unwrap_or_default();
                let definition = if columns.is_empty() {
                    None
                } else {
                    Some(format!("UNIQUE ({})", columns.iter().map(|c| escape_mysql_id(c)).collect::<Vec<_>>().join(", ")))
                };
                constraints.push(TableConstraintInfo {
                    name: r.get("CONSTRAINT_NAME").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                    constraint_type: "UNIQUE".to_string(),
                    columns,
                    definition,
                });
            }
        }

        // MySQL 8+ exposes CHECK_CONSTRAINTS. Older versions may not have this table,
        // so keep checks best-effort and never block table expansion because of it.
        let check_sql = format!(
            "SELECT tc.CONSTRAINT_NAME, cc.CHECK_CLAUSE \
             FROM information_schema.TABLE_CONSTRAINTS tc \
             JOIN information_schema.CHECK_CONSTRAINTS cc \
               ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA \
              AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME \
             WHERE tc.TABLE_SCHEMA = {} AND tc.TABLE_NAME = {} AND tc.CONSTRAINT_TYPE = 'CHECK' \
             ORDER BY tc.CONSTRAINT_NAME",
            escape_string_literal(&target_schema),
            escape_string_literal(table)
        );

        if let Ok(check_results) = self.execute_query(&check_sql, None, None).await {
            if let Some(res) = check_results.first() {
                for r in &res.rows {
                    constraints.push(TableConstraintInfo {
                        name: r.get("CONSTRAINT_NAME").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                        constraint_type: "CHECK".to_string(),
                        columns: Vec::new(),
                        definition: r.get("CHECK_CLAUSE").and_then(|v| v.as_str()).map(|s| format!("CHECK ({})", s)),
                    });
                }
            }
        }

        Ok(constraints)
    }

    async fn alter_table(&self, table: &str, _schema: Option<&str>, database: Option<&str>, changes: Vec<TableChange>) -> DbResult<()> {
        let (pool, config) = self.get_pool_and_config().await?;
        let mut conn = pool.get_conn().await.map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        Self::configure_connection(&mut conn, &config).await?;
        let db_name = database.unwrap_or("");

        let mut sql_parts = Vec::new();
        let mut reorder_changes = Vec::new();
        for change in changes {
            match change {
                TableChange::AddColumn(col) => {
                    sql_parts.push(format!("ADD COLUMN {}", Self::build_column_definition(&col)));
                },
                TableChange::ModifyColumn { old_name, new_column } => {
                    let part = if old_name != new_column.name {
                        format!("CHANGE COLUMN {} {}", escape_mysql_id(&old_name), Self::build_column_definition(&new_column))
                    } else {
                        format!("MODIFY COLUMN {}", Self::build_column_definition(&new_column))
                    };
                    sql_parts.push(part);
                },
                TableChange::ReorderColumn { column, after_column } => {
                    reorder_changes.push((column, after_column));
                },
                TableChange::DropColumn(name) => {
                    sql_parts.push(format!("DROP COLUMN {}", escape_mysql_id(&name)));
                },
                TableChange::AddIndex(idx) => {
                    let cols = idx.columns.iter().map(|c| escape_mysql_id(c)).collect::<Vec<_>>().join(", ");
                    let unique = if idx.is_unique { "UNIQUE " } else { "" };
                    sql_parts.push(format!("ADD {}INDEX {} ({})", unique, escape_mysql_id(&idx.name), cols));
                },
                TableChange::DropIndex(name) => {
                    sql_parts.push(format!("DROP INDEX {}", escape_mysql_id(&name)));
                },
                TableChange::AddForeignKey(fk) => {
                    sql_parts.push(format!(
                        "ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {}.{} ({}) ON UPDATE {} ON DELETE {}",
                        escape_mysql_id(&fk.name), escape_mysql_id(&fk.column_name), escape_mysql_id(db_name), escape_mysql_id(&fk.referenced_table_name), escape_mysql_id(&fk.referenced_column_name),
                        fk.update_rule.as_deref().unwrap_or("NO ACTION"),
                        fk.delete_rule.as_deref().unwrap_or("NO ACTION")
                    ));
                },
                TableChange::DropForeignKey(name) => {
                    sql_parts.push(format!("DROP FOREIGN KEY {}", escape_mysql_id(&name)));
                },
            }
        }

        if !sql_parts.is_empty() {
            let sql = format!("ALTER TABLE {}.{} {}", escape_mysql_id(db_name), escape_mysql_id(table), sql_parts.join(", "));
            debug!(sql = %sql, "执行 MySQL ALTER TABLE");
            conn.query_drop(&sql).await.map_err(|e| DbError::QueryFailed(Self::format_mysql_error(e)))?;
        }

        for (column, after_column) in reorder_changes {
            let position = match after_column {
                Some(after_column) => format!(" AFTER {}", escape_mysql_id(&after_column)),
                None => " FIRST".to_string(),
            };
            let sql = format!(
                "ALTER TABLE {}.{} MODIFY COLUMN {}{}",
                escape_mysql_id(db_name),
                escape_mysql_id(table),
                Self::build_column_definition(&column),
                position
            );
            debug!(sql = %sql, "执行 MySQL 字段顺序调整");
            conn.query_drop(&sql).await.map_err(|e| DbError::QueryFailed(Self::format_mysql_error(e)))?;
        }
        
        Ok(())
    }

    async fn get_table_ddl(&self, table: &str, _schema: Option<&str>) -> DbResult<String> {
        let sql = format!("SHOW CREATE TABLE {}", escape_mysql_id(table));
        let results = self.execute_query(&sql, None, None).await?;
        if let Some(res) = results.first() {
            if let Some(row) = res.rows.first() {
                return Ok(row.get("Create Table").or_else(|| row.values().nth(1)).and_then(|v| v.as_str()).unwrap_or("").to_string());
            }
        }
        Err(DbError::Other("无法获取 DDL".into()))
    }

    async fn get_view_definition(&self, view: &str, _schema: Option<&str>) -> DbResult<String> {
        let sql = format!("SHOW CREATE VIEW {}", escape_mysql_id(view));
        let results = self.execute_query(&sql, None, None).await?;
        if let Some(res) = results.first() {
            if let Some(row) = res.rows.first() {
                return Ok(row.get("Create View").or_else(|| row.values().nth(1)).and_then(|v| v.as_str()).unwrap_or("").to_string());
            }
        }
        Err(DbError::Other("无法获取视图定义".into()))
    }

    async fn get_index_definition(&self, index: &str, _schema: Option<&str>, database: Option<&str>) -> DbResult<String> {
        let db_name = database.unwrap_or("");
        let sql = format!(
            "SELECT INDEX_NAME, TABLE_NAME, NON_UNIQUE, INDEX_TYPE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ', ') AS COLUMNS \
             FROM information_schema.STATISTICS \
             WHERE TABLE_SCHEMA = {} AND INDEX_NAME = {} \
             GROUP BY INDEX_NAME, TABLE_NAME, NON_UNIQUE, INDEX_TYPE \
             LIMIT 1",
            escape_string_literal(db_name),
            escape_string_literal(index)
        );
        let results = self.execute_query(&sql, None, None).await?;
        if let Some(res) = results.first() {
            if let Some(row) = res.rows.first() {
                let table_name = row.get("TABLE_NAME").and_then(|v| v.as_str()).unwrap_or_default();
                let non_unique = row.get("NON_UNIQUE").and_then(|v| v.as_i64()).unwrap_or(1);
                let index_type = row.get("INDEX_TYPE").and_then(|v| v.as_str()).unwrap_or("BTREE");
                let columns = row.get("COLUMNS").and_then(|v| v.as_str()).unwrap_or_default()
                    .split(',')
                    .map(|item| escape_mysql_id(item.trim()))
                    .collect::<Vec<_>>()
                    .join(", ");
                let unique = if non_unique == 0 { "UNIQUE " } else { "" };
                return Ok(format!(
                    "CREATE {}INDEX {} ON {}.{} USING {} ({})",
                    unique,
                    escape_mysql_id(index),
                    escape_mysql_id(db_name),
                    escape_mysql_id(table_name),
                    index_type,
                    columns
                ));
            }
        }
        Err(DbError::Other("无法获取索引定义".into()))
    }

    async fn get_routine_definition(&self, name: &str, schema: Option<&str>, database: Option<&str>, routine_type: &str, identity_arguments: Option<&str>, _oid: Option<i64>) -> DbResult<String> {
        let target_schema = self.resolve_database_name(database, schema).await?;
        debug!(
            schema = %target_schema,
            name = %name,
            routine_type = %routine_type,
            identity_arguments = ?identity_arguments,
            "正在获取 MySQL 例程定义"
        );
        let sql = if routine_type == "procedure" {
            format!("SHOW CREATE PROCEDURE {}.{}", escape_mysql_id(&target_schema), escape_mysql_id(name))
        } else {
            format!("SHOW CREATE FUNCTION {}.{}", escape_mysql_id(&target_schema), escape_mysql_id(name))
        };
        let results = self.execute_query(&sql, None, None).await?;
        if let Some(res) = results.first() {
            if let Some(row) = res.rows.first() {
                let key = if routine_type == "procedure" { "Create Procedure" } else { "Create Function" };
                return Ok(row.get(key).or_else(|| row.values().nth(2)).and_then(|v| v.as_str()).unwrap_or("").to_string());
            }
        }
        Err(DbError::Other("无法获取函数定义".into()))
    }

    async fn explain_query(&self, sql: &str, database: Option<&str>, query_id: Option<u64>) -> DbResult<Vec<QueryResult>> {
        let explain_sql = format!("EXPLAIN {}", sql);
        self.execute_query(&explain_sql, database, query_id).await
    }

    async fn cancel_query(&self, query_id: u64) -> DbResult<bool> {
        let Some((config, connection_id)) = self.get_cancel_target(query_id).await? else {
            return Ok(false);
        };

        let mut cancel_conn = Conn::new(Self::create_opts(&config))
            .await
            .map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        Self::configure_connection(&mut cancel_conn, &config).await?;

        match cancel_conn.query_drop(format!("KILL QUERY {}", connection_id)).await {
            Ok(_) => Ok(true),
            Err(MySqlError::Server(server_error)) if server_error.code == 1094 => Ok(false),
            Err(error) => Err(DbError::QueryFailed(Self::format_mysql_error(error))),
        }
    }

    fn as_any(&self) -> &dyn std::any::Any { self }
}
