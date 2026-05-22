use crate::database::{ColumnInfo, IndexInfo, ForeignKeyInfo, TriggerInfo, TableConstraintInfo, RuleInfo, DatabaseInfo, TableInfo, SchemaInfo, FunctionInfo, ExtensionInfo, DatabaseType};
use crate::AppState;
use super::error::ToCommandResult;
use tauri::State;
use serde_json::Value;
use serde::Serialize;
use std::collections::BTreeSet;
use std::sync::Arc;

#[tauri::command]
pub async fn get_databases(connection_id: String, state: State<'_, AppState>) -> Result<Vec<DatabaseInfo>, String> {
    state.connection_manager.get_databases(&connection_id).await.to_cmd_result()
}

#[tauri::command]
pub async fn get_tables(connection_id: String, database: Option<String>, state: State<'_, AppState>) -> Result<Vec<TableInfo>, String> {
    state.connection_manager.get_tables(&connection_id, database.as_deref()).await.to_cmd_result()
}

#[tauri::command]
pub async fn get_views(connection_id: String, database: Option<String>, state: State<'_, AppState>) -> Result<Vec<TableInfo>, String> {
    state.connection_manager.get_views(&connection_id, database.as_deref()).await.to_cmd_result()
}

#[tauri::command]
pub async fn get_schemas(connection_id: String, database: Option<String>, state: State<'_, AppState>) -> Result<Vec<SchemaInfo>, String> {
    state.connection_manager.get_schemas(&connection_id, database.as_deref()).await.to_cmd_result()
}

#[tauri::command]
pub async fn get_schema_tables(connection_id: String, database: String, schema: String, state: State<'_, AppState>) -> Result<Vec<TableInfo>, String> {
    let tables = state.connection_manager.get_tables(&connection_id, Some(&database)).await.to_cmd_result()?;
    Ok(tables.into_iter().filter(|t| t.schema.as_deref() == Some(&schema)).collect())
}

#[tauri::command]
pub async fn get_schema_views(connection_id: String, database: String, schema: String, state: State<'_, AppState>) -> Result<Vec<TableInfo>, String> {
    let views = state.connection_manager.get_views(&connection_id, Some(&database)).await.to_cmd_result()?;
    Ok(views.into_iter().filter(|v| v.schema.as_deref() == Some(&schema)).collect())
}

#[tauri::command]
pub async fn get_schema_functions(connection_id: String, database: String, schema: String, state: State<'_, AppState>) -> Result<Vec<FunctionInfo>, String> {
    tracing::info!(conn = %connection_id, db = %database, sc = %schema, "正在获取 Schema 函数...");
    state.connection_manager.get_functions(&connection_id, Some(&database), Some(&schema)).await.map_err(|e| {
        tracing::error!(err = %e, "获取 Schema 函数失败");
        e.to_string()
    })
}

#[tauri::command]
pub async fn get_schema_procedures(connection_id: String, database: String, schema: String, state: State<'_, AppState>) -> Result<Vec<FunctionInfo>, String> {
    tracing::info!(conn = %connection_id, db = %database, sc = %schema, "正在获取 Schema 存储过程...");
    state.connection_manager.get_procedures(&connection_id, Some(&database), Some(&schema)).await.map_err(|e| {
        tracing::error!(err = %e, "获取 Schema 存储过程失败");
        e.to_string()
    })
}

#[tauri::command]
pub async fn get_schema_aggregate_functions(connection_id: String, database: String, schema: String, state: State<'_, AppState>) -> Result<Vec<FunctionInfo>, String> {
    state.connection_manager.get_aggregate_functions(&connection_id, Some(&database), Some(&schema)).await.to_cmd_result()
}

#[tauri::command]
pub async fn get_database_extensions(connection_id: String, database: String, state: State<'_, AppState>) -> Result<Vec<ExtensionInfo>, String> {
    tracing::info!(conn = %connection_id, db = %database, "正在获取数据库扩展...");
    state.connection_manager.get_extensions(&connection_id, Some(&database)).await.map_err(|e| {
        tracing::error!(err = %e, "获取数据库扩展失败");
        e.to_string()
    })
}

#[tauri::command]
pub async fn get_table_structure(connection_id: String, table: String, database: Option<String>, schema: Option<String>, state: State<'_, AppState>) -> Result<Vec<ColumnInfo>, String> {
    state.connection_manager.get_table_structure(&connection_id, &table, schema.as_deref(), database.as_deref()).await.to_cmd_result()
}

#[tauri::command]
pub async fn get_table_indexes(connection_id: String, table: String, schema: Option<String>, state: State<'_, AppState>) -> Result<Vec<IndexInfo>, String> {
    state.connection_manager.get_indexes(&connection_id, &table, schema.as_deref()).await.to_cmd_result()
}

#[tauri::command]
pub async fn get_table_foreign_keys(connection_id: String, table: String, schema: Option<String>, state: State<'_, AppState>) -> Result<Vec<ForeignKeyInfo>, String> {
    state.connection_manager.get_foreign_keys(&connection_id, &table, schema.as_deref()).await.to_cmd_result()
}

#[tauri::command]
pub async fn get_table_triggers(connection_id: String, table: String, database: Option<String>, schema: Option<String>, state: State<'_, AppState>) -> Result<Vec<TriggerInfo>, String> {
    state.connection_manager.get_triggers(&connection_id, &table, schema.as_deref(), database.as_deref()).await.to_cmd_result()
}

#[tauri::command]
pub async fn get_table_constraints(connection_id: String, table: String, database: Option<String>, schema: Option<String>, state: State<'_, AppState>) -> Result<Vec<TableConstraintInfo>, String> {
    state.connection_manager.get_table_constraints(&connection_id, &table, schema.as_deref(), database.as_deref()).await.to_cmd_result()
}

#[tauri::command]
pub async fn get_table_rules(connection_id: String, table: String, database: Option<String>, schema: Option<String>, state: State<'_, AppState>) -> Result<Vec<RuleInfo>, String> {
    state.connection_manager.get_rules(&connection_id, &table, schema.as_deref(), database.as_deref()).await.to_cmd_result()
}

#[tauri::command]
pub async fn get_schema_indexes(connection_id: String, database: String, schema: String, state: State<'_, AppState>) -> Result<Vec<IndexInfo>, String> {
    state.connection_manager.get_schema_indexes(&connection_id, Some(&database), Some(&schema)).await.to_cmd_result()
}

#[tauri::command]
pub async fn get_create_table_ddl(connection_id: String, table: String, database: Option<String>, schema: Option<String>, state: State<'_, AppState>) -> Result<String, String> {
    state.connection_manager.get_table_ddl(&connection_id, &table, schema.as_deref(), database.as_deref()).await.to_cmd_result()
}

#[tauri::command]
pub async fn get_view_definition(
    connection_id: String,
    database: String,
    view: String,
    schema: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state
        .connection_manager
        .get_view_definition(&connection_id, &view, schema.as_deref(), Some(&database))
        .await
        .to_cmd_result()
}

#[derive(Serialize, Clone)]
struct AutocompleteColumn {
    name: String,
    data_type: String,
}

#[derive(Serialize)]
struct AutocompleteTable {
    name: String,
    schema: Option<String>,
    database: String,
    table_type: String,
    columns: Vec<AutocompleteColumn>,
}

#[derive(Serialize)]
struct AutocompleteFunction {
    name: String,
    schema: Option<String>,
    database: String,
    return_type: Option<String>,
    arguments: Option<String>,
    function_type: String,
}

#[derive(Serialize)]
#[allow(non_snake_case)]
pub struct RoutineName {
    ROUTINE_NAME: String,
}

fn default_keywords() -> Vec<&'static str> {
    vec![
        "SELECT", "FROM", "WHERE", "INSERT", "UPDATE", "DELETE", "JOIN", "LEFT", "RIGHT",
        "INNER", "OUTER", "ON", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET",
        "CREATE", "ALTER", "DROP", "TABLE", "VIEW", "INDEX", "DATABASE", "VALUES",
        "INTO", "SET", "DISTINCT", "UNION", "ALL", "AND", "OR", "NOT", "NULL",
        "IS", "IN", "EXISTS", "LIKE", "BETWEEN", "AS", "CASE", "WHEN", "THEN", "ELSE", "END",
    ]
}

#[tauri::command]
pub async fn get_functions(
    connection_id: String,
    database: String,
    state: State<'_, AppState>,
) -> Result<Vec<RoutineName>, String> {
    let manager = &state.connection_manager;
    let db_type = manager.get_database_type(&connection_id).await.to_cmd_result()?;

    let names = match db_type {
        DatabaseType::MySQL => manager
            .get_functions(&connection_id, Some(&database), Some(&database))
            .await
            .to_cmd_result()?
            .into_iter()
            .map(|item| item.name)
            .collect(),
        DatabaseType::PostgreSQL => {
            let schemas = manager.get_schemas(&connection_id, Some(&database)).await.unwrap_or_default();
            let schema_names = if schemas.is_empty() {
                vec!["public".to_string()]
            } else {
                schemas.into_iter().map(|schema| schema.name).collect::<Vec<_>>()
            };

            let mut names = BTreeSet::new();
            for schema in schema_names {
                for function in manager
                    .get_functions(&connection_id, Some(&database), Some(&schema))
                    .await
                    .unwrap_or_default()
                {
                    names.insert(function.name);
                }
            }
            names.into_iter().collect()
        }
        _ => Vec::new(),
    };

    Ok(names.into_iter().map(|name| RoutineName { ROUTINE_NAME: name }).collect())
}

#[tauri::command]
pub async fn get_procedures(
    connection_id: String,
    database: String,
    state: State<'_, AppState>,
) -> Result<Vec<RoutineName>, String> {
    let manager = &state.connection_manager;
    let db_type = manager.get_database_type(&connection_id).await.to_cmd_result()?;

    let sql = match db_type {
        DatabaseType::MySQL => format!(
            "SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = '{}' AND ROUTINE_TYPE = 'PROCEDURE' ORDER BY ROUTINE_NAME",
            database.replace('\'', "''")
        ),
        DatabaseType::PostgreSQL => return Ok(Vec::new()),
        _ => return Ok(Vec::new()),
    };

    let results = manager.execute_query(&connection_id, &sql, Some(&database), None).await.to_cmd_result()?;
    let names = results
        .first()
        .map(|result| {
            result.rows.iter().filter_map(|row| {
                row.get("ROUTINE_NAME")
                    .and_then(|value| value.as_str())
                    .map(|name| RoutineName { ROUTINE_NAME: name.to_string() })
            }).collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(names)
}

#[tauri::command]
pub async fn get_autocomplete_data(
    connection_id: String,
    database: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let manager = &state.connection_manager;
    let db_type = manager.get_database_type(&connection_id).await.to_cmd_result()?;
    let configured_database = manager.get_configured_database(&connection_id).await;

    let databases = manager
        .get_databases(&connection_id)
        .await
        .unwrap_or_default();

    let database_names = databases
        .iter()
        .map(|db| db.name.clone())
        .collect::<Vec<_>>();

    let target_databases = if let Some(database) = database.clone().or(configured_database) {
        vec![database]
    } else if matches!(db_type, DatabaseType::SQLite) {
        vec!["main".to_string()]
    } else {
        Vec::new()
    };

    let mut tables = Vec::new();
    let mut functions = Vec::new();

    for db_name in target_databases {
        let mut table_list = manager
            .get_tables(&connection_id, Some(&db_name))
            .await
            .unwrap_or_default();

        let mut view_list = manager
            .get_views(&connection_id, Some(&db_name))
            .await
            .unwrap_or_default();

        table_list.append(&mut view_list);

        let mut schemas = BTreeSet::new();
        let mut function_schemas = BTreeSet::new();

        // 收集所有 schema
        for table in &table_list {
            if let Some(schema) = &table.schema {
                schemas.insert(schema.clone());
            }
        }

        // 按批次并行获取所有表的列信息（避免 N+1 串行查询）
        let cm = Arc::clone(&state.connection_manager);
        const BATCH_SIZE: usize = 10;
        let mut all_columns: Vec<Vec<AutocompleteColumn>> = Vec::with_capacity(table_list.len());

        for chunk in table_list.chunks(BATCH_SIZE) {
            let futures: Vec<_> = chunk.iter().map(|table| {
                let conn_id = connection_id.clone();
                let tname = table.name.clone();
                let tschema = table.schema.clone();
                let db = db_name.clone();
                let mgr = Arc::clone(&cm);
                async move {
                    mgr.get_table_structure(&conn_id, &tname, tschema.as_deref(), Some(&db))
                        .await
                        .unwrap_or_default()
                        .into_iter()
                        .map(|col| AutocompleteColumn { name: col.name, data_type: col.data_type })
                        .collect::<Vec<_>>()
                }
            }).collect();

            let chunk_results = futures::future::join_all(futures).await;
            all_columns.extend(chunk_results);
        }

        // 将列信息关联回对应的表
        for (i, table) in table_list.into_iter().enumerate() {
            let columns = all_columns.get(i).cloned().unwrap_or_default();
            tables.push(AutocompleteTable {
                name: table.name,
                schema: table.schema,
                database: db_name.clone(),
                table_type: table.table_type,
                columns,
            });
        }

        if matches!(db_type, DatabaseType::PostgreSQL) {
            function_schemas.insert("pg_catalog".to_string());

            if schemas.is_empty() {
                function_schemas.insert("public".to_string());
            } else {
                function_schemas.extend(schemas);
            }

            for schema in function_schemas {
                let schema_functions = manager
                    .get_functions(&connection_id, Some(&db_name), Some(&schema))
                    .await
                    .unwrap_or_default();

                let aggregate_functions = manager
                    .get_aggregate_functions(&connection_id, Some(&db_name), Some(&schema))
                    .await
                    .unwrap_or_default();

                functions.extend(schema_functions.into_iter().chain(aggregate_functions.into_iter()).map(|function| AutocompleteFunction {
                    name: function.name,
                    schema: function.schema,
                    database: db_name.clone(),
                    return_type: function.return_type,
                    arguments: function.arguments,
                    function_type: function.function_type,
                }));
            }
        } else if matches!(db_type, DatabaseType::MySQL) {
            let schema_functions = manager
                .get_functions(&connection_id, Some(&db_name), Some(&db_name))
                .await
                .unwrap_or_default();

            functions.extend(schema_functions.into_iter().map(|function| AutocompleteFunction {
                name: function.name,
                schema: function.schema,
                database: db_name.clone(),
                return_type: function.return_type,
                arguments: function.arguments,
                function_type: function.function_type,
            }));
        }
    }

    Ok(serde_json::json!({
        "databases": database_names,
        "tables": tables,
        "functions": functions,
        "keywords": default_keywords(),
    }))
}
