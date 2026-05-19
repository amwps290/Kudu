use crate::database::{ConnectionConfig, DatabaseType, sqlite::SqliteDatabase};
use crate::models::{ConnectionTestResult, StoredConnection};
use crate::utils::crypto;
use crate::AppState;
use super::error::ToCommandResult;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, State};
use tauri_plugin_store::{Store, StoreExt};
use tracing::{info, instrument};

#[derive(Debug, Clone, serde::Deserialize)]
pub struct ConnectionOverrides {
    pub mysql_charset: Option<String>,
    pub mysql_init_sql: Option<String>,
}

fn get_connection_store(app: &AppHandle) -> Result<Arc<Store<tauri::Wry>>, String> {
    app.store("connections.json").map_err(|e| format!("无法访问连接存储: {}", e))
}

/// 将 StoredConnection 转换为 ConnectionConfig
fn stored_to_config(stored: &StoredConnection) -> Result<ConnectionConfig, String> {
    let password = if let Some(ref encrypted) = stored.encrypted_password {
        crypto::decrypt_password(encrypted)?
    } else {
        String::new()
    };
    stored_to_config_with_password(stored, &password)
}

fn stored_to_config_with_password(stored: &StoredConnection, password: &str) -> Result<ConnectionConfig, String> {
    let db_type = stored.db_type.parse::<DatabaseType>()?;

    Ok(ConnectionConfig {
        id: stored.id.clone(),
        name: stored.name.clone(),
        db_type,
        host: stored.host.clone(),
        port: stored.port,
        username: stored.username.clone(),
        password: password.to_string(),
        database: stored.database.clone(),
        ssl: stored.ssl,
        connection_timeout: stored.connection_timeout,
        pool_size: stored.pool_size,
        mysql_charset: stored.mysql_charset.clone(),
        mysql_init_sql: stored.mysql_init_sql.clone(),
        read_only: stored.read_only,
    })
}

#[tauri::command]
#[instrument]
pub async fn create_sqlite_database(path: String) -> Result<String, String> {
    info!(path = %path, "收到创建 SQLite 数据库请求");
    SqliteDatabase::create_database_file(&path).to_cmd_result()?;
    Ok("数据库创建成功".to_string())
}

#[tauri::command]
#[instrument(skip(state, config))]
pub async fn test_connection(
    config: Value,
    state: State<'_, AppState>,
) -> Result<ConnectionTestResult, String> {
    let start = std::time::Instant::now();
    let conn_config: ConnectionConfig = serde_json::from_value(config).to_cmd_result()?;
    let manager = &state.connection_manager;
    let result = manager.test_connection(&conn_config).await;

    match result {
        Ok(_) => Ok(ConnectionTestResult {
            success: true,
            message: "连接成功".to_string(),
            version: None,
            ping_time_ms: start.elapsed().as_millis(),
        }),
        Err(e) => Ok(ConnectionTestResult {
            success: false,
            message: e.to_string(),
            version: None,
            ping_time_ms: start.elapsed().as_millis(),
        }),
    }
}

#[tauri::command]
pub async fn save_connection(
    app: AppHandle,
    mut connection: StoredConnection,
    password: Option<String>,
) -> Result<StoredConnection, String> {
    let store = get_connection_store(&app)?;
    if let Some(pwd) = password {
        if !pwd.is_empty() { connection.encrypted_password = Some(crypto::encrypt_password(&pwd)?); }
    }
    store.set(connection.id.clone(), json!(connection));
    store.save().to_cmd_result()?;
    Ok(connection)
}

#[tauri::command]
pub async fn update_connection(
    app: AppHandle,
    mut connection: StoredConnection,
    password: Option<String>,
) -> Result<StoredConnection, String> {
    let store = get_connection_store(&app)?;
    if !store.has(connection.id.clone()) { return Err("连接配置不存在".to_string()); }
    if let Some(pwd) = password {
        if !pwd.is_empty() { connection.encrypted_password = Some(crypto::encrypt_password(&pwd)?); }
    } else if let Some(existing_value) = store.get(connection.id.clone()) {
        if let Ok(existing_conn) = serde_json::from_value::<StoredConnection>(existing_value) {
            connection.encrypted_password = existing_conn.encrypted_password;
        }
    }
    store.set(connection.id.clone(), json!(connection));
    store.save().to_cmd_result()?;
    Ok(connection)
}

#[tauri::command]
pub async fn get_connections(app: AppHandle) -> Result<Vec<StoredConnection>, String> {
    let start = Instant::now();
    let store_open_start = Instant::now();
    let store = get_connection_store(&app)?;
    let store_open_elapsed = store_open_start.elapsed().as_millis();

    let parse_start = Instant::now();
    let mut connections = Vec::new();
    for (_, value) in store.entries() {
        if let Ok(conn) = serde_json::from_value::<StoredConnection>(value.clone()) { connections.push(conn); }
    }

    info!(
        count = connections.len(),
        store_open_ms = store_open_elapsed,
        parse_ms = parse_start.elapsed().as_millis(),
        total_ms = start.elapsed().as_millis(),
        "已加载连接配置"
    );

    Ok(connections)
}

#[tauri::command]
pub async fn delete_connection(app: AppHandle, id: String) -> Result<bool, String> {
    let store = get_connection_store(&app)?;
    store.delete(id);
    store.save().to_cmd_result()?;
    Ok(true)
}

#[tauri::command]
#[instrument(skip(state, app))]
pub async fn create_connection(
    app: AppHandle,
    connection_id: String,
    overrides: Option<ConnectionOverrides>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let start = Instant::now();
    let store = get_connection_store(&app)?;
    let stored_value = store.get(connection_id.clone()).ok_or("连接配置不存在")?;
    let stored_conn: StoredConnection = serde_json::from_value(stored_value).map_err(|e| format!("解析连接配置失败: {}", e))?;
    let mut config = stored_to_config(&stored_conn)?;
    if let Some(overrides) = overrides {
        if matches!(config.db_type, DatabaseType::MySQL) {
            if let Some(mysql_charset) = overrides.mysql_charset {
                config.mysql_charset = Some(mysql_charset);
            }
            if let Some(mysql_init_sql) = overrides.mysql_init_sql {
                config.mysql_init_sql = Some(mysql_init_sql);
            }
        }
    }
    let manager = &state.connection_manager;
    manager.create_connection(config).await.to_cmd_result()?;
    info!(connection_id = %connection_id, total_ms = start.elapsed().as_millis(), "数据库连接创建完成");
    Ok(())
}

#[tauri::command]
#[instrument(skip(state))]
pub async fn disconnect_database(
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = &state.connection_manager;
    manager.disconnect(&connection_id).await.to_cmd_result()?;
    Ok(())
}

/// 连接健康检查结果
#[derive(Debug, Clone, serde::Serialize)]
pub struct ConnectionHealthResult {
    pub connection_id: String,
    pub alive: bool,
    pub latency_ms: u128,
    pub error: Option<String>,
}

#[tauri::command]
#[instrument(skip(state))]
pub async fn check_connection_health(
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<ConnectionHealthResult, String> {
    let start = std::time::Instant::now();
    let manager = &state.connection_manager;
    match manager.check_health(&connection_id).await {
        Ok(_) => Ok(ConnectionHealthResult {
            connection_id,
            alive: true,
            latency_ms: start.elapsed().as_millis(),
            error: None,
        }),
        Err(e) => Ok(ConnectionHealthResult {
            connection_id,
            alive: false,
            latency_ms: start.elapsed().as_millis(),
            error: Some(e.to_string()),
        }),
    }
}
