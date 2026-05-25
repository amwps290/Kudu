// Prevents additional console window on Windows in release mode
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use kudu::commands;
use kudu::database::ConnectionManager;
use kudu::utils;
use kudu::AppState;
use std::sync::Arc;
use std::time::Instant;
use tauri::Manager;

fn main() {
    let startup_begin = Instant::now();

    // 直接初始化连接管理器 (Arc 即可)
    let manager_start = Instant::now();
    let connection_manager = Arc::new(ConnectionManager::new());
    eprintln!("[startup][rust] ConnectionManager::new took {} ms", manager_start.elapsed().as_millis());

    let run_result = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState { connection_manager })
        .invoke_handler(tauri::generate_handler![
            commands::connection::test_connection,
            commands::connection::save_connection,
            commands::connection::update_connection,
            commands::connection::get_connections,
            commands::connection::delete_connection,
            commands::connection::create_connection,
            commands::connection::disconnect_database,
            commands::connection::check_connection_health,
            commands::connection::create_sqlite_database,
            commands::query::execute_query,
            commands::query::explain_query,
            commands::query::beautify_sql,
            commands::query::prepare_sql_script,
            commands::query::execute_query_batch,
            commands::query::cancel_query,
            commands::query::alter_table_structure,
            commands::query::update_table_data,
            commands::query::insert_table_data,
            commands::query::delete_table_data,
            commands::query::truncate_table,
            commands::query::get_search_path,
            commands::query::set_search_path,
            commands::metadata::get_databases,
            commands::metadata::get_tables,
            commands::metadata::get_table_structure,
            commands::metadata::get_views,
            commands::metadata::get_table_indexes,
            commands::metadata::get_table_foreign_keys,
            commands::metadata::get_table_triggers,
            commands::metadata::get_table_constraints,
            commands::metadata::get_table_rules,
            commands::metadata::get_create_table_ddl,
            commands::metadata::get_view_definition,
            commands::metadata::get_index_definition,
            commands::metadata::get_routine_definition,
            commands::metadata::get_autocomplete_data,
            commands::metadata::get_schemas,
            commands::metadata::get_schema_tables,
            commands::metadata::get_schema_views,
            commands::metadata::get_schema_materialized_views,
            commands::metadata::get_schema_functions,
            commands::metadata::get_schema_procedures,
            commands::metadata::get_schema_aggregate_functions,
            commands::metadata::get_schema_sequences,
            commands::metadata::get_schema_enum_types,
            commands::metadata::get_schema_domain_types,
            commands::metadata::get_schema_composite_types,
            commands::metadata::get_functions,
            commands::metadata::get_procedures,
            commands::metadata::get_schema_indexes,
            commands::metadata::get_database_extensions,
            commands::metadata::get_sequence_definition,
            commands::metadata::get_sequence_state,
            commands::metadata::get_enum_definition,
            commands::metadata::get_domain_definition,
            commands::metadata::get_composite_definition,
            commands::workspace::save_session,
            commands::workspace::load_session,
            commands::workspace::list_db_scripts,
            commands::workspace::create_db_script,
            commands::workspace::get_db_scripts_dir,
            commands::export::export_to_csv,
            commands::export::export_to_json,
            commands::export::export_to_sql,
            commands::export::export_table_ddl,
            commands::utils::read_file,
            commands::utils::write_file,
            commands::utils::save_file_as,
            commands::utils::get_app_info,
            commands::utils::set_log_level,
            commands::utils::log_frontend_timing,
            commands::utils::open_external_url,
            commands::utils::open_in_file_manager,
            commands::fonts::list_system_fonts,
            commands::redis::execute_redis_command,
            commands::redis::get_redis_info,
            commands::redis::get_redis_key_value,
            commands::redis::set_redis_key_value,
            commands::redis::delete_redis_key,
        ])
        .setup(move |app| {
            let setup_start = Instant::now();
            let app_dir_start = Instant::now();
            let app_dir = app
                .path()
                .app_data_dir()
                .ok()
                .or_else(|| std::env::current_dir().ok())
                .unwrap_or_else(std::env::temp_dir);
            eprintln!("[startup][rust] resolve app_dir took {} ms", app_dir_start.elapsed().as_millis());

            let logger_start = Instant::now();
            let guard = utils::logger::init_logger(app_dir);
            Box::leak(Box::new(guard));
            tracing::info!(elapsed_ms = logger_start.elapsed().as_millis(), "日志初始化完成");

            let crypto_start = Instant::now();
            if let Err(error) = utils::crypto::initialize_master_key() {
                tracing::warn!(error = %error, "密钥初始化失败");
            }
            tracing::info!(elapsed_ms = crypto_start.elapsed().as_millis(), "主密钥初始化完成");

            #[cfg(debug_assertions)]
            {
                let devtools_start = Instant::now();
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                    tracing::info!(elapsed_ms = devtools_start.elapsed().as_millis(), "DevTools 已打开");
                } else {
                    tracing::warn!("未找到 main 窗口，无法自动打开 DevTools");
                }
            }

            tracing::info!(elapsed_ms = setup_start.elapsed().as_millis(), total_since_main_ms = startup_begin.elapsed().as_millis(), "Tauri setup 完成");

            // 初始化完成后显示窗口（避免白屏闪烁）
            if let Some(window) = app.get_webview_window("main") {
                window.show().ok();
            }

            Ok(())
        })
        .run(tauri::generate_context!());

    if let Err(error) = run_result {
        let error_text = error.to_string();
        let _ = utils::logger::write_fatal_report("tauri_run", &error_text);
        eprintln!("error while running tauri application: {}", error_text);
        std::process::exit(1);
    }
}
