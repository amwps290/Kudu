use async_trait::async_trait;
use mongodb::{Client, options::ClientOptions, bson::Document};
use futures::stream::TryStreamExt;
use std::collections::HashMap;
use tokio::sync::Mutex;

use super::traits::*;

/// MongoDB 数据库驱动状态
struct MongoState {
    client: Option<Client>,
}

/// MongoDB 数据库驱动
pub struct MongoDatabase {
    state: Mutex<MongoState>,
}

impl MongoDatabase {
    pub fn new() -> Self {
        Self { 
            state: Mutex::new(MongoState { client: None })
        }
    }
}

#[async_trait]
impl DatabaseOperations for MongoDatabase {
    async fn test_connection(&self, config: &ConnectionConfig) -> DbResult<bool> {
        let url = format!("mongodb://{}:{}@{}:{}", config.username, config.password, config.host, config.port);
        let options = ClientOptions::parse(&url).await.map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        let client = Client::with_options(options).map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        client.list_database_names().await.map_err(|e| DbError::QueryFailed(e.to_string()))?;
        Ok(true)
    }

    async fn connect(&self, config: ConnectionConfig) -> DbResult<()> {
        let url = format!("mongodb://{}:{}@{}:{}", config.username, config.password, config.host, config.port);
        let options = ClientOptions::parse(&url).await.map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        let client = Client::with_options(options).map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        let mut state = self.state.lock().await;
        state.client = Some(client);
        Ok(())
    }

    async fn disconnect(&self) -> DbResult<()> {
        let mut state = self.state.lock().await;
        state.client = None;
        Ok(())
    }

    async fn execute_query(&self, sql: &str, database: Option<&str>, _query_id: Option<u64>) -> DbResult<Vec<QueryResult>> {
        let state = self.state.lock().await;
        let client = state.client.as_ref().ok_or(DbError::not_connected())?;
        let db_name = database.ok_or(DbError::QueryFailed("未指定数据库".into()))?;
        let db = client.database(db_name);
        
        // 简单模拟：假设 sql 是集合名称，执行 find
        let coll = db.collection::<Document>(sql);
        let mut cursor = coll.find(Document::new()).await.map_err(|e| DbError::QueryFailed(e.to_string()))?;
        
        let mut rows = Vec::new();
        let mut columns = Vec::new();
        let mut first = true;

        while let Some(doc) = cursor.try_next().await.map_err(|e| DbError::QueryFailed(e.to_string()))? {
            if first {
                columns = doc.keys().map(|k| k.to_string()).collect();
                first = false;
            }
            let mut row_map = HashMap::new();
            for (k, v) in doc {
                row_map.insert(k, serde_json::to_value(v).unwrap_or(serde_json::Value::Null));
            }
            rows.push(row_map);
        }

        Ok(vec![QueryResult {
            columns,
            rows,
            affected_rows: 0,
            execution_time_ms: 0,
            messages: Vec::new(),
        }])
    }

    async fn get_databases(&self) -> DbResult<Vec<DatabaseInfo>> {
        let state = self.state.lock().await;
        let client = state.client.as_ref().ok_or(DbError::not_connected())?;
        let names = client.list_database_names().await.map_err(|e| DbError::QueryFailed(e.to_string()))?;
        Ok(names.into_iter().map(|n| DatabaseInfo { name: n, charset: None, collation: None }).collect())
    }

    async fn get_tables(&self, database: Option<&str>) -> DbResult<Vec<TableInfo>> {
        let state = self.state.lock().await;
        let client = state.client.as_ref().ok_or(DbError::not_connected())?;
        let db_name = database.ok_or(DbError::QueryFailed("未指定数据库".into()))?;
        let names = client.database(db_name).list_collection_names().await.map_err(|e| DbError::QueryFailed(e.to_string()))?;
        Ok(names.into_iter().map(|n| TableInfo { name: n, schema: None, table_type: "COLLECTION".into(), engine: None, rows: None, size_mb: None, comment: None }).collect())
    }

    async fn get_table_structure(&self, _table: &str, _schema: Option<&str>, _database: Option<&str>) -> DbResult<Vec<ColumnInfo>> {
        Ok(Vec::new())
    }

    async fn get_indexes(&self, _table: &str, _schema: Option<&str>) -> DbResult<Vec<IndexInfo>> {
        Ok(Vec::new())
    }

    fn as_any(&self) -> &dyn std::any::Any { self }
}
