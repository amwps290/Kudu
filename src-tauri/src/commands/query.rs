use std::collections::HashMap;
use crate::database::{BatchExecutionResult, QueryResult};
use crate::utils::sql_formatter::SqlFormatter;
use crate::utils::sql_script::{can_paginate_select_statement, split_sql_script};
use crate::AppState;
use super::error::ToCommandResult;
use serde::Serialize;
use tauri::State;
use tracing::{info, instrument};

#[derive(Debug, Serialize)]
pub struct PreparedSqlStatement {
    pub sql: String,
    pub can_page: bool,
}

/// 格式化 SQL
#[tauri::command]
#[instrument(skip(state, sql))]
pub async fn beautify_sql(
    connection_id: String,
    sql: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let manager = &state.connection_manager;
    
    let db_type = manager
        .get_database_type(&connection_id)
        .await
        .to_cmd_result()?;
        
    Ok(SqlFormatter::beautify(&sql, &db_type))
}

/// 执行 SQL 查询 - 支持多结果集
#[tauri::command]
#[instrument(skip(state, sql))]
pub async fn execute_query(
    connection_id: String,
    sql: String,
    database: Option<String>,
    query_id: Option<u64>,
    state: State<'_, AppState>,
) -> Result<Vec<QueryResult>, String> {
    let manager = &state.connection_manager;
    
    info!(
        connection_id = %connection_id,
        database = %database.as_deref().unwrap_or("<default>"),
        sql = %sql.replace('\n', " ").trim(),
        "收到执行请求"
    );
    
    manager
        .execute_query(&connection_id, &sql, database.as_deref(), query_id)
        .await
        .to_cmd_result()
}

/// 获取 SQL 执行计划
#[tauri::command]
#[instrument(skip(state, sql))]
pub async fn explain_query(
    connection_id: String,
    sql: String,
    database: Option<String>,
    query_id: Option<u64>,
    state: State<'_, AppState>,
) -> Result<Vec<QueryResult>, String> {
    let manager = &state.connection_manager;
    
    info!(
        connection_id = %connection_id,
        database = %database.as_deref().unwrap_or("<default>"),
        sql = %sql.replace('\n', " ").trim(),
        "收到解释请求"
    );
    
    manager
        .explain_query(&connection_id, &sql, database.as_deref(), query_id)
        .await
        .to_cmd_result()
}

#[tauri::command]
#[instrument(skip(state, sql))]
pub async fn prepare_sql_script(
    connection_id: String,
    sql: String,
    state: State<'_, AppState>,
) -> Result<Vec<PreparedSqlStatement>, String> {
    let manager = &state.connection_manager;
    let db_type = manager
        .get_database_type(&connection_id)
        .await
        .to_cmd_result()?;

    let statements = split_sql_script(&sql, &db_type);
    Ok(statements
        .into_iter()
        .map(|statement| PreparedSqlStatement {
            can_page: can_paginate_select_statement(&statement.sql, &db_type),
            sql: statement.sql,
        })
        .collect())
}

#[tauri::command]
pub async fn execute_query_batch(
    connection_id: String,
    sqls: Vec<String>,
    database: Option<String>,
    query_id: Option<u64>,
    state: State<'_, AppState>,
) -> Result<BatchExecutionResult, String> {
    let manager = &state.connection_manager;
    manager
        .execute_query_batch(&connection_id, &sqls, database.as_deref(), query_id)
        .await
        .to_cmd_result()
}

#[tauri::command]
pub async fn cancel_query(
    connection_id: String,
    query_id: u64,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let manager = &state.connection_manager;
    info!(
        connection_id = %connection_id,
        query_id = query_id,
        "收到取消执行请求"
    );

    let result = manager
        .cancel_query(&connection_id, query_id)
        .await
        .to_cmd_result()?;

    info!(
        connection_id = %connection_id,
        query_id = query_id,
        cancelled = result,
        "取消执行请求处理完成"
    );

    Ok(result)
}

#[tauri::command]
pub async fn alter_table_structure(
    connection_id: String,
    database: String,
    table: String,
    schema: Option<String>,
    changes: Vec<crate::database::TableChange>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = &state.connection_manager;
    manager
        .alter_table(&connection_id, &table, schema.as_deref(), Some(&database), changes)
        .await
        .to_cmd_result()
}

#[tauri::command]
pub async fn update_table_data(
    connection_id: String,
    database: String,
    table: String,
    schema: Option<String>,
    column: String,
    value: Option<String>,
    where_conditions: HashMap<String, serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = &state.connection_manager;
    manager
        .update_data(&connection_id, &table, schema.as_deref(), Some(&database), &column, value, where_conditions)
        .await
        .to_cmd_result()
}

#[tauri::command]
pub async fn delete_table_data(
    connection_id: String,
    database: String,
    table: String,
    schema: Option<String>,
    where_conditions: HashMap<String, serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = &state.connection_manager;
    manager
        .delete_data(&connection_id, &table, schema.as_deref(), Some(&database), where_conditions)
        .await
        .to_cmd_result()
}

#[tauri::command]
pub async fn insert_table_data(
    connection_id: String,
    database: String,
    table: String,
    schema: Option<String>,
    data: HashMap<String, serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = &state.connection_manager;
    manager
        .insert_data(&connection_id, &table, schema.as_deref(), Some(&database), data)
        .await
        .to_cmd_result()
}

#[tauri::command]
pub async fn truncate_table(
    connection_id: String,
    database: String,
    table: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = &state.connection_manager;
    manager
        .truncate_table(&connection_id, &table, schema.as_deref(), Some(&database))
        .await
        .to_cmd_result()
}

#[tauri::command]
pub async fn get_search_path(
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let manager = &state.connection_manager;
    let db = manager.get_db_ref(&connection_id).await.to_cmd_result()?;
    let results = db.execute_query("SELECT current_setting('search_path')", None, None).await.to_cmd_result()?;
    if let Some(first) = results.first() {
        if let Some(row) = first.rows.first() {
            if let Some(val) = row.get("current_setting") {
                if let Some(s) = val.as_str() {
                    return Ok(s.to_string());
                }
            }
        }
    }
    Ok(String::new())
}

#[tauri::command]
pub async fn set_search_path(
    connection_id: String,
    search_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = &state.connection_manager;
    let db = manager.get_db_ref(&connection_id).await.to_cmd_result()?;
    let sql = format!("SET search_path TO {};", search_path);
    db.execute_query(&sql, None, None).await.to_cmd_result()?;
    Ok(())
}
