use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Instant;
use rusqlite::{params, Connection, InterruptHandle};
use tokio::sync::Mutex;
use tracing::{debug, instrument};
use std::fs::File;
use std::path::Path;

use super::traits::*;
use super::sql_helpers::{build_where_clause, ParamStyle};
use crate::utils::sql_sanitize::{escape_sqlite_id, escape_string_literal};
use crate::utils::sql_script::split_sql_script;

/// SQLite 数据库驱动状态
struct SqliteState {
    conn: Option<Connection>,
    path: Option<String>,
}

struct ActiveSqliteQuery {
    query_id: u64,
    interrupt_handle: InterruptHandle,
}

/// SQLite 数据库驱动 - 基于 rusqlite 的原生实现
pub struct SqliteDatabase {
    state: Mutex<SqliteState>,
    active_query: Arc<StdMutex<Option<ActiveSqliteQuery>>>,
}

impl SqliteDatabase {
    pub fn new() -> Self {
        Self { 
            state: Mutex::new(SqliteState { conn: None, path: None }),
            active_query: Arc::new(StdMutex::new(None)),
        }
    }

    /// 创建新的 SQLite 数据库文件 (由命令层调用)
    pub fn create_database_file(path: &str) -> DbResult<()> {
        if !Path::new(path).exists() {
            File::create(path).map_err(|e| DbError::Other(format!("无法创建文件: {}", e)))?;
        }
        Ok(())
    }

    fn json_to_sqlite_param(value: &serde_json::Value) -> Box<dyn rusqlite::ToSql> {
        match value {
            serde_json::Value::Null => Box::new(rusqlite::types::Null),
            serde_json::Value::Bool(v) => Box::new(if *v { 1_i64 } else { 0_i64 }),
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
                    Box::new(rusqlite::types::Null)
                }
            }
            serde_json::Value::String(v) => Box::new(v.clone()),
            serde_json::Value::Array(_) | serde_json::Value::Object(_) => Box::new(value.to_string()),
        }
    }

    fn set_active_query(&self, query_id: u64, interrupt_handle: InterruptHandle) {
        let mut active_query = self.active_query.lock().unwrap();
        *active_query = Some(ActiveSqliteQuery { query_id, interrupt_handle });
    }

    fn clear_active_query(&self, query_id: u64) {
        let mut active_query = self.active_query.lock().unwrap();
        if active_query.as_ref().map(|query| query.query_id) == Some(query_id) {
            *active_query = None;
        }
    }
}

#[async_trait]
impl DatabaseOperations for SqliteDatabase {
    async fn test_connection(&self, config: &ConnectionConfig) -> DbResult<bool> {
        let _conn = Connection::open(&config.host).map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        Ok(true)
    }

    async fn connect(&self, config: ConnectionConfig) -> DbResult<()> {
        let conn = Connection::open(&config.host).map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        let mut state = self.state.lock().await;
        state.conn = Some(conn);
        state.path = Some(config.host);
        Ok(())
    }

    async fn disconnect(&self) -> DbResult<()> {
        let mut state = self.state.lock().await;
        state.conn = None;
        *self.active_query.lock().unwrap() = None;
        Ok(())
    }

    async fn check_health(&self) -> DbResult<bool> {
        let state = self.state.lock().await;
        let conn = state.conn.as_ref().ok_or(DbError::not_connected())?;
        conn.execute_batch("SELECT 1").map_err(|e| DbError::QueryFailed(e.to_string()))?;
        Ok(true)
    }

    #[instrument(skip(self, sql))]
    async fn execute_query(&self, sql: &str, _database: Option<&str>, query_id: Option<u64>) -> DbResult<Vec<QueryResult>> {
        let start = Instant::now();
        let state = self.state.lock().await;
        let conn = state.conn.as_ref().ok_or(DbError::not_connected())?;

        if let Some(query_id) = query_id {
            self.set_active_query(query_id, conn.get_interrupt_handle());
        }

        let result = (|| {
            let sqls = split_sql_script(sql, &DatabaseType::SQLite);
            let mut results = Vec::new();

            for statement in sqls {
                let mut stmt = conn.prepare(&statement.sql).map_err(|e| DbError::QueryFailed(e.to_string()))?;
                let column_count = stmt.column_count();
                let column_names: Vec<String> = stmt.column_names().into_iter().map(|n| n.to_string()).collect();

                let mut rows = Vec::new();
                if column_count > 0 {
                    let mut query_rows = stmt.query(params![]).map_err(|e| DbError::QueryFailed(e.to_string()))?;
                    while let Some(row) = query_rows.next().map_err(|e| DbError::QueryFailed(e.to_string()))? {
                        let mut row_map = HashMap::new();
                        for i in 0..column_count {
                            let value: serde_json::Value = match row.get_ref(i).unwrap() {
                                rusqlite::types::ValueRef::Null => serde_json::Value::Null,
                                rusqlite::types::ValueRef::Integer(i) => serde_json::Value::Number(i.into()),
                                rusqlite::types::ValueRef::Real(f) => serde_json::Value::Number(serde_json::Number::from_f64(f).unwrap()),
                                rusqlite::types::ValueRef::Text(t) => serde_json::Value::String(String::from_utf8_lossy(t).into_owned()),
                                rusqlite::types::ValueRef::Blob(b) => serde_json::Value::String(format!("BLOB ({} bytes)", b.len())),
                            };
                            row_map.insert(column_names[i].clone(), value);
                        }
                        rows.push(row_map);
                    }
                }

                results.push(QueryResult {
                    columns: column_names,
                    rows,
                    affected_rows: conn.changes() as u64,
                    execution_time_ms: start.elapsed().as_millis(),
                    messages: Vec::new(),
                });
            }

            if results.is_empty() {
                results.push(QueryResult::empty(0));
            }

            Ok(results)
        })();

        if let Some(query_id) = query_id {
            self.clear_active_query(query_id);
        }

        result
    }

    async fn get_databases(&self) -> DbResult<Vec<DatabaseInfo>> {
        Ok(vec![DatabaseInfo {
            name: "main".into(),
            charset: None,
            collation: None,
            ctype: None,
            owner: None,
            tablespace: None,
            size_bytes: None,
            allow_connections: None,
            connection_limit: None,
            is_template: None,
        }])
    }

    async fn get_tables(&self, _database: Option<&str>) -> DbResult<Vec<TableInfo>> {
        let state = self.state.lock().await;
        let conn = state.conn.as_ref().ok_or(DbError::not_connected())?;
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map_err(|e| DbError::QueryFailed(e.to_string()))?;
        let rows = stmt.query_map([], |row| Ok(TableInfo {
            oid: None,
            name: row.get(0)?,
            schema: None,
            table_type: "TABLE".into(),
            engine: None,
            owner: None,
            tablespace: None,
            rows: None,
            size_mb: None,
            size_bytes: None,
            main_size_bytes: None,
            toast_size_bytes: None,
            persistence: None,
            fillfactor: None,
            comment: None,
            is_partitioned: false,
            partition_key: None,
            partition_parent: None,
            partition_bound: None,
            partitions: vec![],
        })).map_err(|e| DbError::QueryFailed(e.to_string()))?;
        Ok(rows.map(|r| r.unwrap()).collect())
    }

    async fn get_table_structure(&self, table: &str, _schema: Option<&str>, _database: Option<&str>) -> DbResult<Vec<ColumnInfo>> {
        let state = self.state.lock().await;
        let conn = state.conn.as_ref().ok_or(DbError::not_connected())?;
        let mut stmt = conn.prepare(&format!("PRAGMA table_info('{}')", table.replace("'", "''"))).map_err(|e| DbError::QueryFailed(e.to_string()))?;
        let rows = stmt.query_map([], |row| {
            let pk: i64 = row.get(5)?;
            Ok(ColumnInfo {
                name: row.get(1)?, data_type: row.get(2)?, nullable: row.get::<usize, i64>(3)? == 0,
                default_value: row.get(4).ok(), is_primary_key: pk > 0,
                is_auto_increment: false, comment: None, character_maximum_length: None, numeric_precision: None, numeric_scale: None,
                collation: None, is_identity: None, identity_generation: None, generated_expression: None,
            })
        }).map_err(|e| DbError::QueryFailed(e.to_string()))?;
        Ok(rows.map(|r| r.unwrap()).collect())
    }

    async fn update_data(&self, table: &str, _schema: Option<&str>, column: &str, value: Option<String>, where_conditions: HashMap<String, serde_json::Value>) -> DbResult<()> {
        let state = self.state.lock().await;
        let conn = state.conn.as_ref().ok_or(DbError::not_connected())?;

        let wc = build_where_clause(&where_conditions, escape_sqlite_id, ParamStyle::QuestionMark);

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        params.push(Box::new(value));
        for pv in wc.param_values {
            params.push(Box::new(pv));
        }

        let sql = format!("UPDATE {} SET {} = ? WHERE {}", escape_sqlite_id(table), escape_sqlite_id(column), wc.sql);
        debug!(sql = %sql, "执行 SQLite 参数化更新");

        let p_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, p_refs.as_slice()).map_err(|e| DbError::QueryFailed(e.to_string()))?;
        Ok(())
    }

    async fn insert_data(&self, table: &str, _schema: Option<&str>, data: HashMap<String, serde_json::Value>) -> DbResult<()> {
        if data.is_empty() {
            return Err(DbError::ConfigError("插入数据不能为空".into()));
        }

        let state = self.state.lock().await;
        let conn = state.conn.as_ref().ok_or(DbError::not_connected())?;

        let mut entries: Vec<(String, serde_json::Value)> = data.into_iter().collect();
        entries.sort_by(|a, b| a.0.cmp(&b.0));

        let columns = entries.iter().map(|(name, _)| escape_sqlite_id(name)).collect::<Vec<_>>().join(", ");
        let placeholders = std::iter::repeat_n("?", entries.len()).collect::<Vec<_>>().join(", ");
        let sql = format!("INSERT INTO {} ({}) VALUES ({})", escape_sqlite_id(table), columns, placeholders);
        debug!(sql = %sql, "执行 SQLite 参数化插入");

        let params = entries.iter().map(|(_, value)| Self::json_to_sqlite_param(value)).collect::<Vec<_>>();
        let p_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|param| param.as_ref()).collect();
        conn.execute(&sql, p_refs.as_slice()).map_err(|e| DbError::QueryFailed(e.to_string()))?;
        Ok(())
    }

    async fn delete_data(&self, table: &str, _schema: Option<&str>, where_conditions: HashMap<String, serde_json::Value>) -> DbResult<()> {
        let state = self.state.lock().await;
        let conn = state.conn.as_ref().ok_or(DbError::not_connected())?;

        let wc = build_where_clause(&where_conditions, escape_sqlite_id, ParamStyle::QuestionMark);

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        for pv in wc.param_values {
            params.push(Box::new(pv));
        }

        let sql = format!("DELETE FROM {} WHERE {}", escape_sqlite_id(table), wc.sql);
        debug!(sql = %sql, "执行 SQLite 参数化删除");

        let p_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, p_refs.as_slice()).map_err(|e| DbError::QueryFailed(e.to_string()))?;
        Ok(())
    }

    async fn truncate_table(&self, table: &str, _schema: Option<&str>) -> DbResult<()> {
        let state = self.state.lock().await;
        let conn = state.conn.as_ref().ok_or(DbError::not_connected())?;
        let sql = format!("DELETE FROM {}", escape_sqlite_id(table));
        debug!(sql = %sql, "执行 SQLite 清空表");
        conn.execute(&sql, []).map_err(|e| DbError::QueryFailed(e.to_string()))?;
        Ok(())
    }

    async fn get_indexes(&self, table: &str, _schema: Option<&str>) -> DbResult<Vec<IndexInfo>> {
        let res_vec = self.execute_query(&format!("PRAGMA index_list('{}')", table.replace("'", "''")), None, None).await?;
        let mut indexes = Vec::new();
        if let Some(res) = res_vec.first() {
            for r in &res.rows {
                let name = r.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let col_res_vec = self.execute_query(&format!("PRAGMA index_info('{}')", name.replace("'", "''")), None, None).await?;
                if let Some(col_res) = col_res_vec.first() {
                    let columns = col_res.rows.iter().map(|cr| cr.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string()).collect();
                    indexes.push(IndexInfo { 
                        oid: None,
                        name, columns, 
                        is_unique: r.get("unique").and_then(|v| v.as_i64()).map(|n| n > 0).or_else(|| r.get("unique").and_then(|v| v.as_str()).map(|s| s == "1")).unwrap_or(false), 
                        is_primary: false, index_type: "BTREE".to_string(), tablespace: None, size_bytes: None, fillfactor: None, include_columns: None, predicate: None, definition: None
                    });
                }
            }
        }
        Ok(indexes)
    }

    async fn get_foreign_keys(&self, table: &str, _schema: Option<&str>) -> DbResult<Vec<ForeignKeyInfo>> {
        let sql = format!("PRAGMA foreign_key_list('{}')", table.replace("'", "''"));
        let results = self.execute_query(&sql, None, None).await?;
        let mut fks = Vec::new();
        if let Some(res) = results.first() {
            for r in &res.rows {
                fks.push(ForeignKeyInfo {
                    name: format!("fk_{}_{}", table, r.get("from").and_then(|v| v.as_str()).unwrap_or("")),
                    column_name: r.get("from").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                    referenced_table_name: r.get("table").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                    referenced_column_name: r.get("to").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                    update_rule: r.get("on_update").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    delete_rule: r.get("on_delete").and_then(|v| v.as_str()).map(|s| s.to_string()),
                });
            }
        }
        Ok(fks)
    }

    async fn get_triggers(&self, table: &str, _schema: Option<&str>, _database: Option<&str>) -> DbResult<Vec<TriggerInfo>> {
        let sql = format!(
            "SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = '{}' ORDER BY name",
            table.replace("'", "''")
        );
        let results = self.execute_query(&sql, None, None).await?;
        if let Some(res) = results.first() {
            Ok(res.rows.iter().map(|r| {
                let definition = r.get("sql").and_then(|v| v.as_str()).map(|s| s.to_string());
                let upper_definition = definition.as_deref().unwrap_or_default().to_uppercase();
                let timing = ["BEFORE", "AFTER", "INSTEAD OF"]
                    .iter()
                    .find(|timing| upper_definition.contains(**timing))
                    .map(|s| s.to_string());
                let event = ["INSERT", "UPDATE", "DELETE"]
                    .iter()
                    .find(|event| upper_definition.contains(**event))
                    .map(|s| s.to_string());

                TriggerInfo {
                    name: r.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                    table_name: r.get("tbl_name").and_then(|v| v.as_str()).unwrap_or(table).to_string(),
                    timing,
                    event,
                    enabled: None,
                    orientation: None,
                    definition,
                }
            }).collect())
        } else {
            Ok(vec![])
        }
    }

    async fn get_table_constraints(&self, table: &str, _schema: Option<&str>, _database: Option<&str>) -> DbResult<Vec<TableConstraintInfo>> {
        let index_results = self.execute_query(&format!("PRAGMA index_list('{}')", table.replace("'", "''")), None, None).await?;
        let mut constraints = Vec::new();

        if let Some(res) = index_results.first() {
            for row in &res.rows {
                let is_unique = row.get("unique")
                    .and_then(|v| v.as_i64())
                    .map(|n| n > 0)
                    .or_else(|| row.get("unique").and_then(|v| v.as_str()).map(|s| s == "1"))
                    .unwrap_or(false);
                let origin = row.get("origin").and_then(|v| v.as_str()).unwrap_or("");
                if !is_unique || origin != "u" {
                    continue;
                }

                let name = row.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let col_results = self.execute_query(&format!("PRAGMA index_info('{}')", name.replace("'", "''")), None, None).await?;
                let columns = col_results
                    .first()
                    .map(|col_res| col_res.rows.iter()
                        .filter_map(|cr| cr.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()))
                        .collect::<Vec<_>>())
                    .unwrap_or_default();
                let definition = if columns.is_empty() { None } else { Some(format!("UNIQUE ({})", columns.join(", "))) };

                constraints.push(TableConstraintInfo {
                    name,
                    constraint_type: "UNIQUE".to_string(),
                    columns,
                    definition,
                });
            }
        }

        Ok(constraints)
    }

    async fn alter_table(&self, table: &str, _schema: Option<&str>, _database: Option<&str>, changes: Vec<TableChange>) -> DbResult<()> {
        let state = self.state.lock().await;
        let conn = state.conn.as_ref().ok_or(DbError::not_connected())?;

        for change in changes {
            match change {
                TableChange::AddColumn(col) => {
                    let mut sql = format!("ALTER TABLE {} ADD COLUMN {} {}", escape_sqlite_id(table), escape_sqlite_id(&col.name), col.data_type);
                    if !col.nullable { sql.push_str(" NOT NULL"); }
                    if let Some(ref d) = col.default_value { sql.push_str(&format!(" DEFAULT {}", escape_string_literal(d))); }
                    
                    debug!(sql = %sql, "执行 SQLite ALTER TABLE ADD COLUMN");
                    conn.execute(&sql, []).map_err(|e| DbError::QueryFailed(e.to_string()))?;
                },
                TableChange::ReorderColumn { .. } => {
                    return Err(DbError::Other("SQLite 暂不支持调整字段顺序".into()));
                },
                _ => return Err(DbError::Other("SQLite 暂仅支持添加列操作。修改/删除列需要重构表，暂未实现。".into())),
            }
        }
        
        Ok(())
    }

    async fn get_table_ddl(&self, table: &str, _schema: Option<&str>) -> DbResult<String> {
        let sql = format!("SELECT sql FROM sqlite_master WHERE name = '{}'", table.replace("'", "''"));
        let results = self.execute_query(&sql, None, None).await?;
        if let Some(res) = results.first() {
            if let Some(row) = res.rows.first() {
                return Ok(row.get("sql").and_then(|v| v.as_str()).unwrap_or("").to_string());
            }
        }
        Err(DbError::Other("无法获取 DDL".into()))
    }

    async fn get_view_definition(&self, view: &str, _schema: Option<&str>) -> DbResult<String> {
        let sql = format!(
            "SELECT sql FROM sqlite_master WHERE type = 'view' AND name = '{}'",
            view.replace('\'', "''")
        );
        let results = self.execute_query(&sql, None, None).await?;
        if let Some(res) = results.first() {
            if let Some(row) = res.rows.first() {
                return Ok(row.get("sql").and_then(|v| v.as_str()).unwrap_or("").to_string());
            }
        }
        Err(DbError::Other("无法获取视图定义".into()))
    }

    async fn explain_query(&self, sql: &str, database: Option<&str>, query_id: Option<u64>) -> DbResult<Vec<QueryResult>> {
        let explain_sql = format!("EXPLAIN QUERY PLAN {}", sql);
        self.execute_query(&explain_sql, database, query_id).await
    }

    async fn cancel_query(&self, query_id: u64) -> DbResult<bool> {
        let active_query = self.active_query.lock().unwrap();
        if let Some(active_query) = active_query.as_ref() {
            if active_query.query_id == query_id {
                active_query.interrupt_handle.interrupt();
                return Ok(true);
            }
        }

        Ok(false)
    }

    fn as_any(&self) -> &dyn std::any::Any { self }
}
