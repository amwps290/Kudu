use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::time::Instant;
use tokio_postgres::{CancelToken, Client, NoTls};
use tracing::{info, instrument, error, debug, warn};
use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;
use tokio::sync::Mutex;

use super::traits::*;
use super::constants::PG_DEFAULT_SCHEMA;
use super::sql_helpers::{build_where_clause, ParamStyle};
use crate::utils::sql_sanitize::{escape_pg_id, escape_string_literal};

/// PostgreSQL 驱动状态容器 - 用于内部互斥
struct ActivePgQuery {
    query_id: u64,
    cancel_token: CancelToken,
    backend_pid: i32,
}

struct PgState {
    client: Option<Arc<Client>>,
    config: Option<ConnectionConfig>,
    active_query: Option<ActivePgQuery>,
    notices: Arc<StdMutex<Vec<DbMessage>>>,
}

/// PostgreSQL 数据库驱动 - 基于 tokio-postgres 的底层实现 (具备内部并发能力)
pub struct PostgreSqlDatabase {
    state: Mutex<PgState>,
}

impl PostgreSqlDatabase {
    pub fn new() -> Self {
        Self { 
            state: Mutex::new(PgState {
                client: None,
                config: None,
                active_query: None,
                notices: Arc::new(StdMutex::new(Vec::new())),
            })
        }
    }

    /// libpq 连接字符串值转义：用单引号包裹，转义反斜杠和单引号
    fn escape_connstr_value(val: &str) -> String {
        format!("'{}'", val.replace('\\', "\\\\").replace('\'', "\\'"))
    }

    fn trim_utf8_to_bytes(input: &str, max_bytes: usize) -> String {
        if input.len() <= max_bytes {
            return input.to_string();
        }

        let mut end = max_bytes;
        while end > 0 && !input.is_char_boundary(end) {
            end -= 1;
        }
        input[..end].to_string()
    }

    fn build_application_name(config: &ConnectionConfig) -> String {
        let connection_name = config
            .name
            .chars()
            .filter(|ch| !ch.is_control())
            .collect::<String>()
            .trim()
            .to_string();

        let application_name = if connection_name.is_empty() {
            "Kudu".to_string()
        } else {
            format!("Kudu/{}", connection_name)
        };

        Self::trim_utf8_to_bytes(&application_name, 63)
    }

    /// 获取已连接客户端的 Arc 引用（不持有锁），若未连接则返回错误
    async fn get_client_arc(&self) -> DbResult<Arc<Client>> {
        let state = self.state.lock().await;
        state.client.as_ref().cloned().ok_or(DbError::not_connected())
    }

    fn log_sql_error(context: &str, sql: &str, error: &tokio_postgres::Error) {
        error!(
            context = context,
            sql = %sql.replace('\n', " "),
            error = %Self::format_pg_error(&error),
            "SQL 执行失败"
        );
    }

    async fn get_aggregate_definition(
        &self,
        client: &Client,
        schema_name: &str,
        name: &str,
        identity_arguments: Option<&str>,
        oid: Option<i64>,
    ) -> DbResult<String> {
        let oid_condition = oid
            .map(|value| format!("p.oid = {}::oid", value))
            .unwrap_or_else(|| "FALSE".to_string());
        let identity_literal = identity_arguments
            .map(escape_string_literal)
            .unwrap_or_else(|| "NULL".to_string());
        let name_condition = format!(
            "p.proname = {} AND ({} IS NULL OR pg_get_function_identity_arguments(p.oid) = {})",
            escape_string_literal(name),
            identity_literal,
            identity_literal
        );
        let sql = format!(
            "
            SELECT format(
                'CREATE AGGREGATE %I.%I(%s) (\\n    SFUNC = %s,\\n    STYPE = %s%s%s%s%s%s%s%s%s%s\\n);',
                n.nspname,
                p.proname,
                pg_get_function_identity_arguments(p.oid),
                a.aggtransfn::regproc,
                format_type(a.aggtranstype, NULL),
                CASE WHEN a.aggfinalfn <> 0::regproc THEN format(',\\n    FINALFUNC = %s', a.aggfinalfn::regproc) ELSE '' END,
                CASE WHEN a.aggcombinefn <> 0::regproc THEN format(',\\n    COMBINEFUNC = %s', a.aggcombinefn::regproc) ELSE '' END,
                CASE WHEN a.aggserialfn <> 0::regproc THEN format(',\\n    SERIALFUNC = %s', a.aggserialfn::regproc) ELSE '' END,
                CASE WHEN a.aggdeserialfn <> 0::regproc THEN format(',\\n    DESERIALFUNC = %s', a.aggdeserialfn::regproc) ELSE '' END,
                CASE WHEN a.aggmtransfn <> 0::regproc THEN format(',\\n    MSFUNC = %s', a.aggmtransfn::regproc) ELSE '' END,
                CASE WHEN a.aggminvtransfn <> 0::regproc THEN format(',\\n    MINVFUNC = %s', a.aggminvtransfn::regproc) ELSE '' END,
                CASE WHEN a.aggmfinalfn <> 0::regproc THEN format(',\\n    MFINALFUNC = %s', a.aggmfinalfn::regproc) ELSE '' END,
                CASE WHEN a.aggmtranstype <> 0 THEN format(',\\n    MSTYPE = %s', format_type(a.aggmtranstype, NULL)) ELSE '' END,
                CASE WHEN a.agginitval IS NOT NULL THEN format(',\\n    INITCOND = %L', a.agginitval) ELSE '' END,
                CASE WHEN a.aggminitval IS NOT NULL THEN format(',\\n    MINITCOND = %L', a.aggminitval) ELSE '' END
            )
            FROM pg_aggregate a
            JOIN pg_proc p ON p.oid = a.aggfnoid
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = {schema}
              AND (
                    ({oid_condition})
                 OR (
                    {oid_is_null}
                    AND {name_condition}
                 )
              )
            ORDER BY p.oid
            LIMIT 1
            ",
            schema = escape_string_literal(schema_name),
            oid_condition = oid_condition,
            oid_is_null = if oid.is_none() { "TRUE" } else { "FALSE" },
            name_condition = name_condition,
        );
        info!(sql = %sql.replace('\n', " "), "执行 PostgreSQL 聚合函数定义 SQL");
        let rows = match client.query(&sql, &[]).await {
            Ok(rows) => {
                info!(matched = rows.len(), "PostgreSQL 聚合函数定义查询完成");
                rows
            }
            Err(error) => {
                let formatted = Self::format_pg_error(&error);
                error!(
                    schema = %schema_name,
                    name = %name,
                    identity_arguments = ?identity_arguments,
                    oid = ?oid,
                    error = %formatted,
                    "PostgreSQL 聚合函数定义查询失败"
                );
                return Err(DbError::QueryFailed(formatted));
            }
        };
        if let Some(row) = rows.first() {
            let definition: String = row.get(0);
            return Ok(definition.replace("\\n", "\n"));
        }
        Err(DbError::Other("无法获取聚合函数定义".into()))
    }

    async fn create_client(config: &ConnectionConfig, notices: Arc<StdMutex<Vec<DbMessage>>>) -> DbResult<Arc<Client>> {
        let db_name = config.database.as_deref().unwrap_or("postgres");
        let timeout_secs = if config.connection_timeout > 0 { config.connection_timeout } else { 5 };
        let application_name = Self::build_application_name(config);
        let conn_str = format!(
            "host={} port={} user={} password={} dbname={} application_name={} connect_timeout={}",
            Self::escape_connstr_value(&config.host),
            config.port,
            Self::escape_connstr_value(&config.username),
            Self::escape_connstr_value(&config.password),
            Self::escape_connstr_value(db_name),
            Self::escape_connstr_value(&application_name),
            timeout_secs
        );
        
        debug!(
            conn = %conn_str.replace(&config.password, "******"),
            application_name = %application_name,
            "正在建立 PostgreSQL 物理连接..."
        );

        if config.ssl {
            let connector = TlsConnector::builder().danger_accept_invalid_certs(true).build().map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
            let connector = MakeTlsConnector::new(connector);
            let (client, connection) = tokio_postgres::connect(&conn_str, connector).await.map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
            let notices = notices.clone();
            tokio::spawn(async move {
                Self::drive_connection(connection, notices).await;
            });
            Ok(Arc::new(client))
        } else {
            let (client, connection) = tokio_postgres::connect(&conn_str, NoTls).await.map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
            let notices = notices.clone();
            tokio::spawn(async move {
                Self::drive_connection(connection, notices).await;
            });
            Ok(Arc::new(client))
        }
    }

    async fn drive_connection<S, T>(connection: tokio_postgres::Connection<S, T>, notices: Arc<StdMutex<Vec<DbMessage>>>)
    where
        S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
        T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
    {
        use futures::future::poll_fn;
        let mut conn = Box::pin(connection);
        loop {
            match poll_fn(|cx| conn.as_mut().poll_message(cx)).await {
                Some(Ok(msg)) => {
                    if let tokio_postgres::AsyncMessage::Notice(notice) = msg {
                        let severity = notice.severity().to_string();
                        let text = notice.message().to_string();
                        debug!(severity = %severity, text = %text, "PostgreSQL 通知");
                        if let Ok(mut n) = notices.lock() {
                            n.push(DbMessage { severity, text });
                        }
                    }
                }
                Some(Err(e)) => {
                    error!("PostgreSQL 连接异常: {}", e);
                    break;
                }
                None => break,
            }
        }
    }

    async fn set_active_query(&self, query_id: u64, cancel_token: CancelToken, backend_pid: i32) {
        let mut state = self.state.lock().await;
        state.active_query = Some(ActivePgQuery { query_id, cancel_token, backend_pid });
    }

    async fn clear_active_query(&self, query_id: u64) {
        let mut state = self.state.lock().await;
        if state.active_query.as_ref().map(|query| query.query_id) == Some(query_id) {
            state.active_query = None;
        }
    }

    async fn get_cancel_target(&self, query_id: u64) -> DbResult<Option<(ConnectionConfig, CancelToken, i32)>> {
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
        Ok(Some((config, active_query.cancel_token.clone(), active_query.backend_pid)))
    }

    /// 将 serde_json::Value 转换为 tokio-postgres 的参数类型
    fn json_to_pg_param(value: &serde_json::Value) -> Box<dyn tokio_postgres::types::ToSql + Sync + Send> {
        match value {
            serde_json::Value::Null => Box::new(None::<String>),
            serde_json::Value::Bool(v) => Box::new(*v),
            serde_json::Value::Number(n) => {
                if let Some(v) = n.as_i64() {
                    Box::new(v)
                } else if let Some(v) = n.as_u64() {
                    if let Ok(signed) = i64::try_from(v) {
                        Box::new(signed)
                    } else {
                        Box::new(v.to_string())
                    }
                } else if let Some(v) = n.as_f64() {
                    Box::new(v)
                } else {
                    Box::new(None::<String>)
                }
            }
            serde_json::Value::String(s) => Box::new(s.clone()),
            serde_json::Value::Array(_) | serde_json::Value::Object(_) => Box::new(value.to_string()),
        }
    }

    fn format_pg_error(error: &tokio_postgres::Error) -> String {
        if let Some(db_error) = error.as_db_error() {
            let mut parts = vec![db_error.message().to_string()];

            if let Some(detail) = db_error.detail() {
                parts.push(format!("detail: {}", detail));
            }
            if let Some(hint) = db_error.hint() {
                parts.push(format!("hint: {}", hint));
            }
            if let Some(position) = db_error.position() {
                parts.push(format!("position: {:?}", position));
            }
            if let Some(table) = db_error.table() {
                parts.push(format!("table: {}", table));
            }
            if let Some(column) = db_error.column() {
                parts.push(format!("column: {}", column));
            }
            if let Some(constraint) = db_error.constraint() {
                parts.push(format!("constraint: {}", constraint));
            }

            return parts.join(" | ");
        }

        error.to_string()
    }
}

#[async_trait]
impl DatabaseOperations for PostgreSqlDatabase {
    async fn test_connection(&self, config: &ConnectionConfig) -> DbResult<bool> {
        let client = Self::create_client(config, Arc::new(StdMutex::new(Vec::new()))).await?;
        client.query("SELECT 1", &[]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        Ok(true)
    }

    async fn connect(&self, config: ConnectionConfig) -> DbResult<()> {
        let notices = {
            let state = self.state.lock().await;
            state.notices.clone()
        };
        let client = Self::create_client(&config, notices).await?;
        let mut state = self.state.lock().await;
        state.client = Some(client);
        state.config = Some(config);
        Ok(())
    }

    async fn disconnect(&self) -> DbResult<()> {
        let mut state = self.state.lock().await;
        state.client = None;
        state.config = None;
        state.active_query = None;
        Ok(())
    }

    async fn check_health(&self) -> DbResult<bool> {
        let client = self.get_client_arc().await?;
        client.query("SELECT 1", &[]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        Ok(true)
    }

    async fn switch_database(&self, database: &str) -> DbResult<()> {
        let state = self.state.lock().await;
        let mut config = state.config.clone().ok_or(DbError::Other("未找到初始配置".into()))?;
        
        if config.database.as_deref() == Some(database) {
            return Ok(());
        }
        
        info!(new_db = %database, "PostgreSQL 正在物理切换数据库连接...");
        config.database = Some(database.to_string());
        
        let notices = state.notices.clone();
        drop(state);
        let client = Self::create_client(&config, notices).await?;
        let mut state = self.state.lock().await;
        state.client = Some(client);
        state.config = Some(config);
        Ok(())
    }

    #[instrument(skip(self, sql))]
    async fn execute_query(&self, sql: &str, _database: Option<&str>, query_id: Option<u64>) -> DbResult<Vec<QueryResult>> {
        let start = Instant::now();
        let client = self.get_client_arc().await?;

        if let Some(query_id) = query_id {
            let backend_pid: i32 = client
                .query_one("SELECT pg_backend_pid()", &[])
                .await
                .map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?
                .get(0);
            self.set_active_query(query_id, client.cancel_token(), backend_pid).await;
        }
        
        debug!(sql = %sql.replace('\n', " "), "执行查询");

        let result = async {
            // 清空之前的通知
            {
                let state = self.state.lock().await;
                let mut guard = state.notices.lock().unwrap_or_else(|e| e.into_inner());
                guard.clear();
                drop(guard);
            }

            // 1. 执行 simple_query (文本协议)，它能自动处理多条语句
            let messages = client.simple_query(sql).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
            
            // 收集数据库通知
            let query_notices: Vec<DbMessage> = {
                let state = self.state.lock().await;
                let mut guard = state.notices.lock().unwrap_or_else(|e| e.into_inner());
                let notices: Vec<DbMessage> = guard.drain(..).collect();
                drop(guard);
                notices
            };
            
            let mut results = Vec::new();
            let mut current_columns = Vec::new();
            let mut current_rows = Vec::new();

            for msg in messages {
                match msg {
                    tokio_postgres::SimpleQueryMessage::RowDescription(columns) => {
                        current_columns = columns.iter().map(|c| c.name().to_string()).collect();
                    },
                    tokio_postgres::SimpleQueryMessage::Row(row) => {
                        if current_columns.is_empty() {
                            for i in 0..row.len() {
                                current_columns.push(format!("column_{}", i + 1));
                            }
                        }
                        
                        let mut row_map = HashMap::new();
                        for i in 0..row.len() {
                            let col_name = current_columns.get(i).cloned().unwrap_or_else(|| format!("column_{}", i + 1));
                            let val = row.get(i).map(|s| serde_json::Value::String(s.to_string())).unwrap_or(serde_json::Value::Null);
                            row_map.insert(col_name, val);
                        }
                        current_rows.push(row_map);
                    },
                    tokio_postgres::SimpleQueryMessage::CommandComplete(count) => {
                        results.push(QueryResult {
                            columns: current_columns.clone(),
                            rows: current_rows.clone(),
                            affected_rows: count,
                            execution_time_ms: start.elapsed().as_millis(),
                            messages: Vec::new(),
                        });
                        current_columns.clear();
                        current_rows.clear();
                    },
                    _ => {}
                }
            }

            if !current_rows.is_empty() || !current_columns.is_empty() {
                results.push(QueryResult {
                    columns: current_columns,
                    rows: current_rows,
                    affected_rows: 0,
                    execution_time_ms: start.elapsed().as_millis(),
                    messages: Vec::new(),
                });
            }

            if results.is_empty() {
                results.push(QueryResult::empty(start.elapsed().as_millis()));
            }

            // 将数据库通知附加到第一个结果集
            if !query_notices.is_empty() {
                if let Some(first) = results.first_mut() {
                    first.messages = query_notices;
                }
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
        let client = self.get_client_arc().await?;
        let rows = client.query("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname", &[]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        Ok(rows.into_iter().map(|r| DatabaseInfo { name: r.get(0), charset: None, collation: None }).collect())
    }

    async fn get_schemas(&self, _db: Option<&str>) -> DbResult<Vec<SchemaInfo>> {
        let client = self.get_client_arc().await?;
        let sql = "SELECT nspname, pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema' ORDER BY nspname";
        let rows = client.query(sql, &[]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        Ok(rows.into_iter().map(|r| SchemaInfo { name: r.get(0), owner: r.try_get(1).ok(), comment: None }).collect())
    }

    async fn get_tables(&self, _db: Option<&str>) -> DbResult<Vec<TableInfo>> {
        let client = self.get_client_arc().await?;
        let sql = "
            SELECT
                c.oid::int8,
                n.nspname,
                c.relname,
                c.relkind::text,
                obj_description(c.oid),
                pg_total_relation_size(c.oid)::float8 / 1024 / 1024,
                CASE WHEN c.relkind = 'p' THEN pg_get_partkeydef(c.oid) END AS partition_key,
                CASE WHEN pc.relkind = 'p' THEN pn.nspname END AS parent_schema,
                CASE WHEN pc.relkind = 'p' THEN pc.relname END AS parent_name,
                CASE WHEN pc.relkind = 'p' THEN pg_get_expr(c.relpartbound, c.oid, true) END AS partition_bound
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_inherits inh ON inh.inhrelid = c.oid
            LEFT JOIN pg_class pc ON pc.oid = inh.inhparent
            LEFT JOIN pg_namespace pn ON pn.oid = pc.relnamespace
            WHERE c.relkind IN ('r', 'p')
              AND n.nspname NOT IN ('pg_catalog', 'information_schema')
              AND NOT EXISTS (
                  SELECT 1
                  FROM pg_inherits inh2
                  JOIN pg_class parent2 ON parent2.oid = inh2.inhparent
                  WHERE inh2.inhrelid = c.oid
                    AND parent2.relkind = 'p'
              )
            ORDER BY n.nspname, c.relname
        ";
        let rows = client.query(sql, &[]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;

        let partitions_sql = "
            SELECT
                inh.inhparent::int8 AS parent_oid,
                cn.nspname AS child_schema,
                child.relname AS child_name,
                pg_get_expr(child.relpartbound, child.oid, true) AS partition_bound
            FROM pg_inherits inh
            JOIN pg_class child ON child.oid = inh.inhrelid
            JOIN pg_namespace cn ON cn.oid = child.relnamespace
            JOIN pg_class parent ON parent.oid = inh.inhparent
            JOIN pg_namespace pn ON pn.oid = parent.relnamespace
            WHERE parent.relkind = 'p'
              AND child.relkind IN ('r', 'p')
              AND pn.nspname NOT IN ('pg_catalog', 'information_schema')
            ORDER BY cn.nspname, child.relname
        ";
        let partition_rows = client.query(partitions_sql, &[]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        let mut partitions_by_parent: HashMap<i64, Vec<TablePartitionInfo>> = HashMap::new();
        for row in partition_rows {
            let parent_oid: i64 = row.get(0);
            partitions_by_parent.entry(parent_oid).or_default().push(TablePartitionInfo {
                schema: Some(row.get(1)),
                name: row.get(2),
                bound: row.try_get(3).ok(),
            });
        }

        Ok(rows.into_iter().map(|r| {
            let oid: i64 = r.get(0);
            let relkind: String = r.get(3);
            let parent_schema: Option<String> = r.try_get(7).ok();
            let parent_name: Option<String> = r.try_get(8).ok();
            let partition_parent = match (parent_schema, parent_name) {
                (Some(schema), Some(name)) => Some(format!("{}.{}", schema, name)),
                _ => None,
            };

            TableInfo {
                name: r.get(2),
                schema: Some(r.get(1)),
                table_type: if relkind == "p" { "PARTITIONED TABLE".into() } else if partition_parent.is_some() { "PARTITION".into() } else { "TABLE".into() },
                engine: None,
                rows: None,
                size_mb: r.try_get(5).ok(),
                comment: r.try_get(4).ok(),
                is_partitioned: relkind == "p",
                partition_key: r.try_get(6).ok(),
                partition_parent,
                partition_bound: r.try_get(9).ok(),
                partitions: partitions_by_parent.remove(&oid).unwrap_or_default(),
            }
        }).collect())
    }

    async fn get_views(&self, _db: Option<&str>) -> DbResult<Vec<TableInfo>> {
        let client = self.get_client_arc().await?;
        let sql = "SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'v' AND n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY n.nspname, c.relname";
        let rows = client.query(sql, &[]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        Ok(rows.into_iter().map(|r| TableInfo { name: r.get(1), schema: Some(r.get(0)), table_type: "VIEW".into(), engine: None, rows: None, size_mb: None, comment: None, is_partitioned: false, partition_key: None, partition_parent: None, partition_bound: None, partitions: vec![] }).collect())
    }

    async fn get_materialized_views(&self, _database: Option<&str>, schema: Option<&str>) -> DbResult<Vec<TableInfo>> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let sql = "
            SELECT n.nspname, c.relname, obj_description(c.oid), pg_total_relation_size(c.oid)::float8 / 1024 / 1024
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind = 'm'
              AND n.nspname = $1
            ORDER BY n.nspname, c.relname
        ";
        let rows = client.query(sql, &[&schema_name]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        Ok(rows.into_iter().map(|r| TableInfo {
            name: r.get(1),
            schema: Some(r.get(0)),
            table_type: "MATERIALIZED VIEW".into(),
            engine: None,
            rows: None,
            size_mb: r.try_get(3).ok(),
            comment: r.try_get(2).ok(),
            is_partitioned: false,
            partition_key: None,
            partition_parent: None,
            partition_bound: None,
            partitions: vec![],
        }).collect())
    }

    async fn get_table_structure(&self, table: &str, schema: Option<&str>, _db: Option<&str>) -> DbResult<Vec<ColumnInfo>> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        
        let sql = "
            SELECT a.attname, format_type(a.atttypid, a.atttypmod), CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END, pg_get_expr(d.adbin, d.adrelid), CASE WHEN a.attlen = -1 THEN 0 ELSE a.attlen END
            FROM pg_attribute a JOIN pg_class c ON a.attrelid = c.oid JOIN pg_namespace n ON c.relnamespace = n.oid LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
            WHERE c.relname = $1 AND n.nspname = $2 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum;
        ";
        let rows = client.query(sql, &[&table, &schema_name]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        
        let pk_sql = "SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = ($1::text)::regclass AND i.indisprimary";
        let pk_rows = client.query(pk_sql, &[&format!("{}.{}", schema_name, table)]).await.unwrap_or_default();
        let pk_cols: Vec<String> = pk_rows.into_iter().map(|r| r.get(0)).collect();

        Ok(rows.into_iter().map(|r| {
            let name: String = r.get(0);
            let data_type: String = r.get(1);
            let nullable: String = r.get(2);
            let is_pk = pk_cols.contains(&name);
            let max_len: i32 = r.get(4);
            ColumnInfo {
                name, data_type, nullable: nullable == "YES",
                default_value: r.try_get(3).ok(), is_primary_key: is_pk, is_auto_increment: false,
                comment: None, character_maximum_length: if max_len > 0 { Some(max_len as i64) } else { None }, 
                numeric_precision: None, numeric_scale: None,
            }
        }).collect())
    }

    async fn update_data(&self, table: &str, schema: Option<&str>, column: &str, value: Option<String>, where_conditions: HashMap<String, serde_json::Value>) -> DbResult<()> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);

        // 使用参数化查询: SET 值用 $1, WHERE 条件从 $2 开始
        let wc = build_where_clause(&where_conditions, escape_pg_id, ParamStyle::DollarNumber(1));

        let sql = format!(
            "UPDATE {}.{} SET {} = $1 WHERE {}",
            escape_pg_id(schema_name), escape_pg_id(table), escape_pg_id(column), wc.sql
        );

        debug!(sql = %sql, "执行 PostgreSQL 参数化更新");

        // 参数放独立作用域以确保在 await 点之前 drop
        let result = {
            let set_param: Box<dyn tokio_postgres::types::ToSql + Sync + Send> = match &value {
                Some(v) => Box::new(v.clone()),
                None => Box::new(None::<String>),
            };
            let mut owned: Vec<Box<dyn tokio_postgres::types::ToSql + Sync + Send>> = vec![set_param];
            for pv in &wc.param_values {
                match pv {
                    Some(s) => owned.push(Box::new(s.clone())),
                    None => owned.push(Box::new(None::<String>)),
                }
            }
            let mut refs: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = Vec::with_capacity(owned.len());
            for p in &owned {
                refs.push(p.as_ref());
            }
            client.execute(&sql, &refs).await
        };
        result.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        Ok(())
    }

    async fn insert_data(&self, table: &str, schema: Option<&str>, data: HashMap<String, serde_json::Value>) -> DbResult<()> {
        if data.is_empty() {
            return Err(DbError::ConfigError("插入数据不能为空".into()));
        }

        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);

        let mut entries: Vec<(String, serde_json::Value)> = data.into_iter().collect();
        entries.sort_by(|a, b| a.0.cmp(&b.0));

        let columns = entries.iter().map(|(name, _)| escape_pg_id(name)).collect::<Vec<_>>().join(", ");

        // 构建 $1, $2, ... 占位符
        let placeholders: Vec<String> = (1..=entries.len()).map(|i| format!("${}", i)).collect();

        let sql = format!(
            "INSERT INTO {}.{} ({}) VALUES ({})",
            escape_pg_id(schema_name),
            escape_pg_id(table),
            columns,
            placeholders.join(", ")
        );

        debug!(sql = %sql, "执行 PostgreSQL 参数化插入");

        let result = {
            let owned: Vec<Box<dyn tokio_postgres::types::ToSql + Sync + Send>> = entries
                .iter()
                .map(|(_, value)| Self::json_to_pg_param(value))
                .collect();
            let mut refs: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = Vec::with_capacity(owned.len());
            for p in &owned {
                refs.push(p.as_ref());
            }
            client.execute(&sql, &refs).await
        };
        result.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        Ok(())
    }

    async fn delete_data(&self, table: &str, schema: Option<&str>, where_conditions: HashMap<String, serde_json::Value>) -> DbResult<()> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);

        let wc = build_where_clause(&where_conditions, escape_pg_id, ParamStyle::DollarNumber(0));

        let sql = format!(
            "DELETE FROM {}.{} WHERE {}",
            escape_pg_id(schema_name), escape_pg_id(table), wc.sql
        );

        debug!(sql = %sql, "执行 PostgreSQL 参数化删除");

        let result = {
            let mut owned: Vec<Box<dyn tokio_postgres::types::ToSql + Sync + Send>> = Vec::new();
            for pv in &wc.param_values {
                match pv {
                    Some(s) => owned.push(Box::new(s.clone())),
                    None => owned.push(Box::new(None::<String>)),
                }
            }
            let mut refs: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = Vec::with_capacity(owned.len());
            for p in &owned {
                refs.push(p.as_ref());
            }
            client.execute(&sql, &refs).await
        };
        result.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        Ok(())
    }

    async fn truncate_table(&self, table: &str, schema: Option<&str>) -> DbResult<()> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let sql = format!(
            "TRUNCATE TABLE {}.{} RESTART IDENTITY",
            escape_pg_id(schema_name),
            escape_pg_id(table)
        );

        debug!(sql = %sql, "执行 PostgreSQL 清空表");
        client.batch_execute(&sql).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        Ok(())
    }

    async fn get_indexes(&self, table: &str, schema: Option<&str>) -> DbResult<Vec<IndexInfo>> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let sql = "
            SELECT
                i.relname AS index_name,
                ix.indisunique,
                ix.indisprimary,
                am.amname,
                pg_relation_size(i.oid)::int8,
                COALESCE((
                    SELECT array_agg(pg_get_indexdef(ix.indexrelid, pos, true) ORDER BY pos)
                    FROM generate_series(1, ix.indnkeyatts) AS pos
                ), ARRAY[]::text[]) AS key_columns,
                CASE
                    WHEN ix.indnatts > ix.indnkeyatts THEN COALESCE((
                        SELECT array_agg(pg_get_indexdef(ix.indexrelid, pos, true) ORDER BY pos)
                        FROM generate_series(ix.indnkeyatts + 1, ix.indnatts) AS pos
                    ), ARRAY[]::text[])
                    ELSE ARRAY[]::text[]
                END AS include_columns,
                pg_get_expr(ix.indpred, ix.indrelid, true) AS predicate
            FROM pg_class t
            JOIN pg_index ix ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_am am ON am.oid = i.relam
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE t.relname = $1
              AND n.nspname = $2
            ORDER BY i.relname
        ";
        let rows = client
            .query(sql, &[&table, &schema_name])
            .await
            .map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;

        Ok(rows
            .into_iter()
            .map(|r| IndexInfo {
                name: r.get(0),
                is_unique: r.get(1),
                is_primary: r.get(2),
                index_type: r.get::<_, String>(3).to_uppercase(),
                size_bytes: Some(r.get(4)),
                columns: r.get::<_, Vec<String>>(5),
                include_columns: {
                    let cols: Vec<String> = r.get(6);
                    if cols.is_empty() { None } else { Some(cols) }
                },
                predicate: r.get(7),
            })
            .collect())
    }

    async fn get_schema_indexes(&self, _database: Option<&str>, schema: Option<&str>) -> DbResult<Vec<IndexInfo>> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let sql = "
            SELECT
                i.relname AS index_name,
                ix.indisunique,
                ix.indisprimary,
                am.amname,
                pg_relation_size(i.oid)::int8,
                COALESCE((
                    SELECT array_agg(pg_get_indexdef(ix.indexrelid, pos, true) ORDER BY pos)
                    FROM generate_series(1, ix.indnkeyatts) AS pos
                ), ARRAY[]::text[]) AS key_columns,
                CASE
                    WHEN ix.indnatts > ix.indnkeyatts THEN COALESCE((
                        SELECT array_agg(pg_get_indexdef(ix.indexrelid, pos, true) ORDER BY pos)
                        FROM generate_series(ix.indnkeyatts + 1, ix.indnatts) AS pos
                    ), ARRAY[]::text[])
                    ELSE ARRAY[]::text[]
                END AS include_columns,
                pg_get_expr(ix.indpred, ix.indrelid, true) AS predicate
            FROM pg_index ix
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_am am ON am.oid = i.relam
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_namespace n ON n.oid = i.relnamespace
            WHERE n.nspname = $1
            ORDER BY i.relname
        ";
        let rows = client
            .query(sql, &[&schema_name])
            .await
            .map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        let indexes: Vec<IndexInfo> = rows
            .into_iter()
            .map(|r| IndexInfo {
                name: r.get(0),
                is_unique: r.get(1),
                is_primary: r.get(2),
                index_type: r.get::<_, String>(3).to_uppercase(),
                size_bytes: Some(r.get(4)),
                columns: r.get::<_, Vec<String>>(5),
                include_columns: {
                    let cols: Vec<String> = r.get(6);
                    if cols.is_empty() { None } else { Some(cols) }
                },
                predicate: r.get(7),
            })
            .collect();
        debug!(count = indexes.len(), sc = %schema_name, "已获取 PostgreSQL 索引");
        Ok(indexes)
    }

    async fn get_foreign_keys(&self, table: &str, schema: Option<&str>) -> DbResult<Vec<ForeignKeyInfo>> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        
        let sql = "
            SELECT
                conname AS constraint_name,
                a.attname AS column_name,
                rt.relname AS referenced_table_name,
                ra.attname AS referenced_column_name,
                confupdtype AS update_rule,
                confdeltype AS delete_rule
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
            JOIN pg_class rt ON rt.oid = c.confrelid
            JOIN pg_attribute ra ON ra.attrelid = rt.oid AND ra.attnum = ANY(c.confkey)
            WHERE c.contype = 'f' AND t.relname = $1 AND n.nspname = $2
        ";
        
        let rows = client.query(sql, &[&table, &schema_name]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        
        Ok(rows.into_iter().map(|r| {
            let u_rule: i8 = r.get(4);
            let d_rule: i8 = r.get(5);
            ForeignKeyInfo {
                name: r.get(0),
                column_name: r.get(1),
                referenced_table_name: r.get(2),
                referenced_column_name: r.get(3),
                update_rule: Some(match u_rule as u8 as char {
                    'c' => "CASCADE", 'n' => "SET NULL", 'd' => "SET DEFAULT", 'r' => "RESTRICT", _ => "NO ACTION"
                }.into()),
                delete_rule: Some(match d_rule as u8 as char {
                    'c' => "CASCADE", 'n' => "SET NULL", 'd' => "SET DEFAULT", 'r' => "RESTRICT", _ => "NO ACTION"
                }.into()),
            }
        }).collect())
    }

    async fn get_triggers(&self, table: &str, schema: Option<&str>, _database: Option<&str>) -> DbResult<Vec<TriggerInfo>> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let sql = "
            SELECT
                tg.tgname,
                cls.relname,
                CASE
                    WHEN (tg.tgtype & 64) = 64 THEN 'INSTEAD OF'
                    WHEN (tg.tgtype & 2) = 2 THEN 'BEFORE'
                    ELSE 'AFTER'
                END AS timing,
                concat_ws(', ',
                    CASE WHEN (tg.tgtype & 4) = 4 THEN 'INSERT' END,
                    CASE WHEN (tg.tgtype & 8) = 8 THEN 'DELETE' END,
                    CASE WHEN (tg.tgtype & 16) = 16 THEN 'UPDATE' END,
                    CASE WHEN (tg.tgtype & 32) = 32 THEN 'TRUNCATE' END
                ) AS event,
                tg.tgenabled::text,
                pg_get_triggerdef(tg.oid, true)
            FROM pg_trigger tg
            JOIN pg_class cls ON cls.oid = tg.tgrelid
            JOIN pg_namespace ns ON ns.oid = cls.relnamespace
            WHERE NOT tg.tgisinternal AND cls.relname = $1 AND ns.nspname = $2
            ORDER BY tg.tgname
        ";
        let rows = client.query(sql, &[&table, &schema_name]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        Ok(rows.into_iter().map(|r| {
            let enabled: String = r.get(4);
            TriggerInfo {
                name: r.get(0),
                table_name: r.get(1),
                timing: Some(r.get(2)),
                event: Some(r.get(3)),
                enabled: Some(enabled != "D"),
                definition: Some(r.get(5)),
            }
        }).collect())
    }

    async fn get_table_constraints(&self, table: &str, schema: Option<&str>, _database: Option<&str>) -> DbResult<Vec<TableConstraintInfo>> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let sql = "
            SELECT
                c.conname,
                CASE c.contype
                    WHEN 'u' THEN 'UNIQUE'
                    WHEN 'c' THEN 'CHECK'
                    WHEN 'x' THEN 'EXCLUDE'
                    ELSE c.contype::text
                END AS constraint_type,
                COALESCE(array_remove(array_agg(a.attname ORDER BY a.attnum), NULL), ARRAY[]::text[]) AS columns,
                pg_get_constraintdef(c.oid, true) AS definition
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            LEFT JOIN unnest(c.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
            LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ck.attnum
            WHERE t.relname = $1 AND n.nspname = $2 AND c.contype IN ('u', 'c', 'x')
            GROUP BY c.oid, c.conname, c.contype
            ORDER BY constraint_type, c.conname
        ";
        let rows = client.query(sql, &[&table, &schema_name]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        Ok(rows.into_iter().map(|r| TableConstraintInfo {
            name: r.get(0),
            constraint_type: r.get(1),
            columns: r.get(2),
            definition: Some(r.get(3)),
        }).collect())
    }

    async fn get_rules(&self, table: &str, schema: Option<&str>, _database: Option<&str>) -> DbResult<Vec<RuleInfo>> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let sql = "
            SELECT
                r.rulename,
                CASE r.ev_type
                    WHEN '1' THEN 'SELECT'
                    WHEN '2' THEN 'UPDATE'
                    WHEN '3' THEN 'INSERT'
                    WHEN '4' THEN 'DELETE'
                    ELSE r.ev_type::text
                END AS event,
                r.is_instead,
                pg_get_ruledef(r.oid, true) AS definition
            FROM pg_rewrite r
            JOIN pg_class t ON t.oid = r.ev_class
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE t.relname = $1 AND n.nspname = $2 AND r.rulename <> '_RETURN'
            ORDER BY r.rulename
        ";
        let rows = client.query(sql, &[&table, &schema_name]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        Ok(rows.into_iter().map(|r| RuleInfo {
            name: r.get(0),
            event: Some(r.get(1)),
            is_instead: Some(r.get(2)),
            definition: Some(r.get(3)),
        }).collect())
    }

    async fn alter_table(&self, table: &str, schema: Option<&str>, _database: Option<&str>, changes: Vec<TableChange>) -> DbResult<()> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        
        let mut sql_parts = Vec::new();
        for change in &changes {
            match change {
                TableChange::AddColumn(col) => {
                    let mut part = format!("ADD COLUMN {} {}", escape_pg_id(&col.name), col.data_type);
                    if !col.nullable { part.push_str(" NOT NULL"); }
                    if let Some(ref d) = col.default_value { part.push_str(&format!(" DEFAULT {}", escape_string_literal(d))); }
                    sql_parts.push(part);
                },
                TableChange::ModifyColumn { old_name, new_column } => {
                    if old_name != &new_column.name {
                        sql_parts.push(format!("RENAME COLUMN {} TO {}", escape_pg_id(old_name), escape_pg_id(&new_column.name)));
                    }
                    sql_parts.push(format!("ALTER COLUMN {} TYPE {}", escape_pg_id(&new_column.name), new_column.data_type));
                    if new_column.nullable {
                        sql_parts.push(format!("ALTER COLUMN {} DROP NOT NULL", escape_pg_id(&new_column.name)));
                    } else {
                        sql_parts.push(format!("ALTER COLUMN {} SET NOT NULL", escape_pg_id(&new_column.name)));
                    }
                },
                TableChange::ReorderColumn { .. } => {
                    return Err(DbError::Other("PostgreSQL 暂不支持调整字段顺序".into()));
                },
                TableChange::DropColumn(name) => {
                    sql_parts.push(format!("DROP COLUMN {}", escape_pg_id(name)));
                },
                TableChange::AddIndex(idx) => {
                    let cols = idx.columns.iter().map(|c| escape_pg_id(c)).collect::<Vec<_>>().join(", ");
                    let unique = if idx.is_unique { "UNIQUE " } else { "" };
                    sql_parts.push(format!("ADD {}INDEX {} ({})", unique, escape_pg_id(&idx.name), cols));
                },
                TableChange::DropIndex(name) => {
                    // PostgreSQL DROP INDEX 是独立命令，不能放在 ALTER TABLE 中
                    debug!(name = %name, "准备删除 PostgreSQL 索引");
                },
                TableChange::AddForeignKey(fk) => {
                    sql_parts.push(format!(
                        "ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {}.{} ({}) ON UPDATE {} ON DELETE {}",
                        escape_pg_id(&fk.name), escape_pg_id(&fk.column_name), escape_pg_id(schema_name), escape_pg_id(&fk.referenced_table_name), escape_pg_id(&fk.referenced_column_name),
                        fk.update_rule.as_deref().unwrap_or("NO ACTION"),
                        fk.delete_rule.as_deref().unwrap_or("NO ACTION")
                    ));
                },
                TableChange::DropForeignKey(name) => {
                    sql_parts.push(format!("DROP CONSTRAINT {}", escape_pg_id(name)));
                },
            }
        }

        // 处理 ALTER TABLE 内部变更
        if !sql_parts.is_empty() {
            let alter_sql = format!("ALTER TABLE {}.{} {}", escape_pg_id(schema_name), escape_pg_id(table), sql_parts.join(", "));
            debug!(sql = %alter_sql, "执行 PostgreSQL ALTER TABLE");
            client.batch_execute(&alter_sql).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        }

        // 处理独立的 DROP INDEX 变更
        for change in &changes {
            if let TableChange::DropIndex(name) = change {
                let drop_idx_sql = format!("DROP INDEX {}.{}", escape_pg_id(schema_name), escape_pg_id(name));
                debug!(sql = %drop_idx_sql, "执行 PostgreSQL DROP INDEX");
                client.batch_execute(&drop_idx_sql).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
            }
        }
        
        Ok(())
    }

    async fn get_table_ddl(&self, table: &str, schema: Option<&str>) -> DbResult<String> {
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let columns = self.get_table_structure(table, Some(schema_name), None).await?;
        
        let client = self.get_client_arc().await?;

        let view_sql = "SELECT pg_get_viewdef(c.oid, true) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'v'";
        let view_rows = client.query(view_sql, &[&schema_name, &table]).await.unwrap_or_default();
        
        if let Some(row) = view_rows.first() {
            let definition: String = row.get(0);
            return Ok(format!("CREATE OR REPLACE VIEW {}.{} AS\n{}", escape_pg_id(schema_name), escape_pg_id(table), definition));
        }

        let mut ddl = format!("CREATE TABLE {}.{} (\n", escape_pg_id(schema_name), escape_pg_id(table));
        let mut col_defs = Vec::new();
        let mut pks = Vec::new();

        for col in columns {
            let mut def = format!("  {} {}", escape_pg_id(&col.name), col.data_type);
            if !col.nullable { def.push_str(" NOT NULL"); }
            if let Some(ref d) = col.default_value { def.push_str(&format!(" DEFAULT {}", escape_string_literal(d))); }
            col_defs.push(def);
            if col.is_primary_key { pks.push(escape_pg_id(&col.name)); }
        }

        ddl.push_str(&col_defs.join(",\n"));
        if !pks.is_empty() {
            ddl.push_str(&format!(",\n  PRIMARY KEY ({})", pks.join(", ")));
        }
        ddl.push_str("\n);");

        Ok(ddl)
    }

    async fn get_view_definition(&self, view: &str, schema: Option<&str>) -> DbResult<String> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let sql = "
            SELECT pg_get_viewdef(c.oid, true), c.relkind::text
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1
              AND c.relname = $2
              AND c.relkind IN ('v', 'm')
        ";
        let rows = client.query(sql, &[&schema_name, &view]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;

        if let Some(row) = rows.first() {
            let definition: String = row.get(0);
            let relkind: String = row.get(1);
            let create_prefix = if relkind == "m" {
                "CREATE MATERIALIZED VIEW"
            } else {
                "CREATE OR REPLACE VIEW"
            };
            return Ok(format!(
                "{} {}.{} AS\n{}",
                create_prefix,
                escape_pg_id(schema_name),
                escape_pg_id(view),
                definition
            ));
        }

        Err(DbError::Other("无法获取视图定义".into()))
    }

    async fn get_index_definition(&self, index: &str, schema: Option<&str>, _database: Option<&str>) -> DbResult<String> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let sql = "
            SELECT pg_get_indexdef(i.oid)
            FROM pg_class i
            JOIN pg_namespace n ON n.oid = i.relnamespace
            WHERE n.nspname = $1
              AND i.relname = $2
        ";
        let rows = client.query(sql, &[&schema_name, &index]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        if let Some(row) = rows.first() {
            let definition: String = row.get(0);
            return Ok(definition);
        }
        Err(DbError::Other("无法获取索引定义".into()))
    }

    async fn get_routine_definition(&self, name: &str, schema: Option<&str>, _database: Option<&str>, routine_type: &str, identity_arguments: Option<&str>, oid: Option<i64>) -> DbResult<String> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        if routine_type == "aggregate" {
            return self.get_aggregate_definition(&client, schema_name, name, identity_arguments, oid).await;
        }
        let prokind = match routine_type {
            "procedure" => "p",
            _ => "f",
        };
        info!(
            schema = %schema_name,
            name = %name,
            routine_type = %routine_type,
            identity_arguments = ?identity_arguments,
            oid = ?oid,
            "正在获取 PostgreSQL 例程定义"
        );
        let oid_condition = oid
            .map(|value| format!("p.oid = {}::oid", value))
            .unwrap_or_else(|| "FALSE".to_string());
        let name_condition = format!(
            "p.proname = {} AND ({} IS NULL OR pg_get_function_identity_arguments(p.oid) = {})",
            escape_string_literal(name),
            identity_arguments
                .map(escape_string_literal)
                .unwrap_or_else(|| "NULL".to_string()),
            identity_arguments
                .map(escape_string_literal)
                .unwrap_or_else(|| "NULL".to_string())
        );
        let sql = format!(
            "
            SELECT pg_get_functiondef(p.oid)
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = {schema}
              AND p.prokind::text = {prokind}
              AND (
                    ({oid_condition})
                 OR (
                    {oid_is_null}
                    AND {name_condition}
                 )
              )
            ORDER BY p.oid
            LIMIT 1
            ",
            schema = escape_string_literal(schema_name),
            prokind = escape_string_literal(prokind),
            oid_condition = oid_condition,
            oid_is_null = if oid.is_none() { "TRUE" } else { "FALSE" },
            name_condition = name_condition,
        );
        info!(sql = %sql.replace('\n', " "), "执行 PostgreSQL 例程定义 SQL");
        let rows = match client
            .query(&sql, &[])
            .await
        {
            Ok(rows) => {
                info!(matched = rows.len(), "PostgreSQL 例程定义查询完成");
                rows
            }
            Err(error) => {
                let formatted = Self::format_pg_error(&error);
                error!(
                    schema = %schema_name,
                    name = %name,
                    routine_type = %routine_type,
                    identity_arguments = ?identity_arguments,
                    oid = ?oid,
                    error = %formatted,
                    "PostgreSQL 例程定义查询失败"
                );
                return Err(DbError::QueryFailed(formatted));
            }
        };
        if let Some(row) = rows.first() {
            let definition: String = row.get(0);
            return Ok(definition);
        }
        Err(DbError::Other("无法获取函数定义".into()))
    }

    async fn get_functions(&self, _database: Option<&str>, schema: Option<&str>) -> DbResult<Vec<FunctionInfo>> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let sql = "SELECT p.oid::int8, p.proname, n.nspname, pg_catalog.pg_get_function_result(p.oid), pg_catalog.pg_get_function_arguments(p.oid), pg_catalog.pg_get_function_identity_arguments(p.oid), l.lanname, obj_description(p.oid, 'pg_proc') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang WHERE n.nspname = $1 AND p.prokind = 'f' ORDER BY p.proname, p.oid";
        
        debug!(sc = %schema_name, "正在查询 PostgreSQL 函数...");
        let rows = client.query(sql, &[&schema_name]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        debug!(count = rows.len(), "已获取函数列表");
        
        Ok(rows.into_iter().map(|r| FunctionInfo { oid: r.try_get(0).ok(), name: r.get(1), schema: Some(r.get(2)), return_type: r.try_get(3).ok(), arguments: r.try_get(4).ok(), identity_arguments: r.try_get(5).ok(), language: r.try_get(6).ok(), function_type: "function".into(), comment: r.try_get(7).ok() }).collect())
    }

    async fn get_aggregate_functions(&self, _database: Option<&str>, schema: Option<&str>) -> DbResult<Vec<FunctionInfo>> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let sql = "SELECT p.oid::int8, p.proname, n.nspname, pg_catalog.pg_get_function_result(p.oid), pg_catalog.pg_get_function_arguments(p.oid), pg_catalog.pg_get_function_identity_arguments(p.oid), obj_description(p.oid, 'pg_proc') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = $1 AND p.prokind = 'a' ORDER BY p.proname, p.oid";
        let rows = client.query(sql, &[&schema_name]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        Ok(rows.into_iter().map(|r| FunctionInfo { oid: r.try_get(0).ok(), name: r.get(1), schema: Some(r.get(2)), return_type: r.try_get(3).ok(), arguments: r.try_get(4).ok(), identity_arguments: r.try_get(5).ok(), language: None, function_type: "aggregate".into(), comment: r.try_get(6).ok() }).collect())
    }

    async fn get_procedures(&self, _database: Option<&str>, schema: Option<&str>) -> DbResult<Vec<FunctionInfo>> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let sql = "SELECT p.oid::int8, p.proname, n.nspname, pg_catalog.pg_get_function_arguments(p.oid), pg_catalog.pg_get_function_identity_arguments(p.oid), l.lanname, obj_description(p.oid, 'pg_proc') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang WHERE n.nspname = $1 AND p.prokind = 'p' ORDER BY p.proname, p.oid";

        debug!(sc = %schema_name, "正在查询 PostgreSQL 存储过程...");
        let rows = client.query(sql, &[&schema_name]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        debug!(count = rows.len(), "已获取 PostgreSQL 存储过程列表");

        Ok(rows.into_iter().map(|r| FunctionInfo {
            oid: r.try_get(0).ok(),
            name: r.get(1),
            schema: Some(r.get(2)),
            return_type: None,
            arguments: r.try_get(3).ok(),
            identity_arguments: r.try_get(4).ok(),
            language: r.try_get(5).ok(),
            function_type: "procedure".into(),
            comment: r.try_get(6).ok(),
        }).collect())
    }

    async fn get_extensions(&self, _database: Option<&str>) -> DbResult<Vec<ExtensionInfo>> {
        let client = self.get_client_arc().await?;
        let sql = "SELECT extname, extversion, n.nspname, obj_description(e.oid, 'pg_extension') FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace ORDER BY extname";
        
        debug!("正在查询 PostgreSQL 扩展...");
        let rows = client.query(sql, &[]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        debug!(count = rows.len(), "已获取扩展列表");
        
        Ok(rows.into_iter().map(|r| ExtensionInfo { name: r.get(0), version: r.get(1), schema: Some(r.get(2)), comment: r.try_get(3).ok() }).collect())
    }

    async fn get_sequences(&self, _database: Option<&str>, schema: Option<&str>) -> DbResult<Vec<SequenceInfo>> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let sql = "
            SELECT c.oid::int8, c.relname, n.nspname, obj_description(c.oid, 'pg_class')
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1
              AND c.relkind = 'S'
            ORDER BY c.relname
        ";
        let rows = client.query(sql, &[&schema_name]).await.map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?;
        Ok(rows.into_iter().map(|r| SequenceInfo {
            oid: r.try_get(0).ok(),
            name: r.get(1),
            schema: Some(r.get(2)),
            comment: r.try_get(3).ok(),
        }).collect())
    }

    async fn get_sequence_definition(&self, name: &str, schema: Option<&str>, _database: Option<&str>, oid: Option<i64>) -> DbResult<String> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let oid_condition = oid
            .map(|value| format!("c.oid = {}::oid", value))
            .unwrap_or_else(|| "FALSE".to_string());
        let sql = format!(
            "
            SELECT
                n.nspname,
                c.relname,
                format_type(s.seqtypid, NULL) AS data_type,
                s.seqstart,
                s.seqincrement,
                s.seqmin,
                s.seqmax,
                s.seqcache,
                s.seqcycle
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_sequence s ON s.seqrelid = c.oid
            WHERE n.nspname = {schema}
              AND c.relkind = 'S'
              AND (
                    ({oid_condition})
                 OR (
                    {oid_is_null}
                    AND c.relname = {name}
                 )
              )
            ORDER BY c.oid
            LIMIT 1
            ",
            schema = escape_string_literal(schema_name),
            oid_condition = oid_condition,
            oid_is_null = if oid.is_none() { "TRUE" } else { "FALSE" },
            name = escape_string_literal(name),
        );
        info!(sql = %sql.replace('\n', " "), "执行 PostgreSQL 序列定义 SQL");
        let rows = client.query(&sql, &[]).await.map_err(|e| {
            Self::log_sql_error("PostgreSQL 序列定义 SQL", &sql, &e);
            DbError::QueryFailed(Self::format_pg_error(&e))
        })?;
        if let Some(row) = rows.first() {
            let sequence_schema: String = row.get(0);
            let sequence_name: String = row.get(1);
            let data_type: String = row.get(2);
            let start_value: i64 = row.get(3);
            let increment_by: i64 = row.get(4);
            let min_value: i64 = row.get(5);
            let max_value: i64 = row.get(6);
            let cache_size: i64 = row.get(7);
            let cycle: bool = row.get(8);

            let definition = format!(
                "CREATE SEQUENCE {}.{}\n    AS {}\n    START WITH {}\n    INCREMENT BY {}\n    MINVALUE {}\n    MAXVALUE {}\n    CACHE {}\n    {};",
                escape_pg_id(&sequence_schema),
                escape_pg_id(&sequence_name),
                data_type,
                start_value,
                increment_by,
                min_value,
                max_value,
                cache_size,
                if cycle { "CYCLE" } else { "NO CYCLE" }
            );
            return Ok(definition);
        }
        Err(DbError::Other("无法获取序列定义".into()))
    }

    async fn get_sequence_state(&self, name: &str, schema: Option<&str>, _database: Option<&str>, oid: Option<i64>) -> DbResult<SequenceStateInfo> {
        let client = self.get_client_arc().await?;
        let schema_name = schema.unwrap_or(PG_DEFAULT_SCHEMA);
        let oid_condition = oid
            .map(|value| format!("c.oid = {}::oid", value))
            .unwrap_or_else(|| "FALSE".to_string());
        let sequence_ref = format!("{}.{}", escape_pg_id(schema_name), escape_pg_id(name));
        let sql = format!(
            "
            SELECT
                c.relname,
                n.nspname,
                seq.last_value,
                seq.is_called,
                s.seqstart,
                s.seqincrement,
                CASE
                    WHEN seq.is_called THEN seq.last_value + s.seqincrement
                    ELSE seq.last_value
                END AS next_value
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_sequence s ON s.seqrelid = c.oid
            JOIN LATERAL (
                SELECT last_value, is_called
                FROM {sequence_ref}
            ) AS seq ON TRUE
            WHERE n.nspname = {schema}
              AND c.relkind = 'S'
              AND (
                    ({oid_condition})
                 OR (
                    {oid_is_null}
                    AND c.relname = {name}
                 )
              )
            ORDER BY c.oid
            LIMIT 1
            ",
            schema = escape_string_literal(schema_name),
            oid_condition = oid_condition,
            oid_is_null = if oid.is_none() { "TRUE" } else { "FALSE" },
            name = escape_string_literal(name),
            sequence_ref = sequence_ref,
        );
        info!(sql = %sql.replace('\n', " "), "执行 PostgreSQL 序列状态 SQL");
        let rows = client.query(&sql, &[]).await.map_err(|e| {
            Self::log_sql_error("PostgreSQL 序列状态 SQL", &sql, &e);
            DbError::QueryFailed(Self::format_pg_error(&e))
        })?;
        if let Some(row) = rows.first() {
            return Ok(SequenceStateInfo {
                name: row.get(0),
                schema: Some(row.get(1)),
                last_value: row.try_get(2).ok(),
                is_called: row.try_get(3).ok(),
                start_value: row.try_get(4).ok(),
                increment_by: row.try_get(5).ok(),
                next_value: row.try_get(6).ok(),
            });
        }
        Err(DbError::Other("无法获取序列状态".into()))
    }

    async fn explain_query(&self, sql: &str, database: Option<&str>, query_id: Option<u64>) -> DbResult<Vec<QueryResult>> {
        let explain_sql = format!("EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT JSON) {}", sql);
        self.execute_query(&explain_sql, database, query_id).await
    }

    async fn cancel_query(&self, query_id: u64) -> DbResult<bool> {
        let Some((config, cancel_token, backend_pid)) = self.get_cancel_target(query_id).await? else {
            info!(query_id = query_id, "PostgreSQL 未找到可取消的活动查询");
            return Ok(false);
        };

        info!(
            query_id = query_id,
            backend_pid = backend_pid,
            ssl = config.ssl,
            "PostgreSQL 开始取消查询"
        );

        if config.ssl {
            let connector = TlsConnector::builder()
                .danger_accept_invalid_certs(true)
                .build()
                .map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
            if let Err(error) = cancel_token
                .cancel_query(MakeTlsConnector::new(connector))
                .await
            {
                warn!(error = %Self::format_pg_error(&error), query_id, backend_pid, "PostgreSQL cancel token 取消失败，准备回退到 pg_cancel_backend");
            } else {
                info!(query_id = query_id, backend_pid = backend_pid, "PostgreSQL cancel token 已发送");
            }
        } else {
            if let Err(error) = cancel_token
                .cancel_query(NoTls)
                .await
            {
                warn!(error = %Self::format_pg_error(&error), query_id, backend_pid, "PostgreSQL cancel token 取消失败，准备回退到 pg_cancel_backend");
            } else {
                info!(query_id = query_id, backend_pid = backend_pid, "PostgreSQL cancel token 已发送");
            }
        }

        let cancel_client = Self::create_client(&config, Arc::new(StdMutex::new(Vec::new()))).await?;
        let cancelled: bool = cancel_client
            .query_one("SELECT pg_cancel_backend($1)", &[&backend_pid])
            .await
            .map_err(|e| DbError::QueryFailed(Self::format_pg_error(&e)))?
            .get(0);

        info!(
            query_id = query_id,
            backend_pid = backend_pid,
            cancelled = cancelled,
            "PostgreSQL pg_cancel_backend 执行完成"
        );

        Ok(cancelled)
    }

    fn as_any(&self) -> &dyn std::any::Any { self }
}
