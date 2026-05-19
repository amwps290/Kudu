use async_trait::async_trait;
use redis::AsyncCommands;
use std::collections::HashMap;
use tokio::sync::Mutex;

use super::traits::*;

/// Redis 数据库驱动状态
struct RedisState {
    client: Option<redis::Client>,
    conn: Option<redis::aio::MultiplexedConnection>,
}

/// Redis 数据库驱动
pub struct RedisDatabase {
    state: Mutex<RedisState>,
}

/// 对 Redis URL 中的特殊字符进行百分比编码（避免引入新依赖）
fn urlencoding_simple(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ':' | '@' | '/' | '?' | '#' | '[' | ']' | '%' => format!("%{:02X}", c as u8),
            _ => c.to_string(),
        })
        .collect()
}

impl RedisDatabase {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(RedisState { client: None, conn: None })
        }
    }

    /// 根据连接配置构建 Redis URL（支持认证和 SSL）
    fn build_redis_url(config: &ConnectionConfig) -> String {
        let scheme = if config.ssl { "rediss" } else { "redis" };
        match (
            !config.password.is_empty(),
            !config.username.is_empty(),
        ) {
            (true, true) => format!(
                "{}://{}:{}@{}:{}",
                scheme,
                urlencoding_simple(&config.username),
                urlencoding_simple(&config.password),
                config.host,
                config.port
            ),
            (true, false) => format!(
                "{}://:{}@{}:{}",
                scheme,
                urlencoding_simple(&config.password),
                config.host,
                config.port
            ),
            _ => format!("{}://{}:{}", scheme, config.host, config.port),
        }
    }

    /// 执行原始 Redis 命令
    pub async fn execute_command(&self, cmd: &str, args: Vec<String>) -> DbResult<redis::Value> {
        let mut state = self.state.lock().await;
        let conn = state.conn.as_mut().ok_or(DbError::not_connected())?;
        
        let mut request = redis::cmd(cmd);
        for arg in args {
            request.arg(arg);
        }
        
        request.query_async(conn).await.map_err(|e| DbError::QueryFailed(e.to_string()))
    }

    /// 获取服务器信息
    pub async fn get_server_info(&self) -> DbResult<String> {
        let mut state = self.state.lock().await;
        let conn = state.conn.as_mut().ok_or(DbError::not_connected())?;
        redis::cmd("INFO").query_async(conn).await.map_err(|e| DbError::QueryFailed(e.to_string()))
    }

    /// 获取 Key 的 TTL
    pub async fn get_key_ttl(&self, key: &str) -> DbResult<i64> {
        let mut state = self.state.lock().await;
        let conn = state.conn.as_mut().ok_or(DbError::not_connected())?;
        conn.ttl(key).await.map_err(|e| DbError::QueryFailed(e.to_string()))
    }

    /// 获取 Key 的值 (根据类型自动处理)
    pub async fn get_key_value(&self, key: &str) -> DbResult<serde_json::Value> {
        let mut state = self.state.lock().await;
        let conn = state.conn.as_mut().ok_or(DbError::not_connected())?;
        
        let key_type: String = redis::cmd("TYPE").arg(key).query_async(conn).await.map_err(|e| DbError::QueryFailed(e.to_string()))?;
        
        match key_type.as_str() {
            "string" => {
                let val: Option<String> = conn.get(key).await.map_err(|e| DbError::QueryFailed(e.to_string()))?;
                Ok(serde_json::Value::String(val.unwrap_or_default()))
            },
            "hash" => {
                let val: HashMap<String, String> = conn.hgetall(key).await.map_err(|e| DbError::QueryFailed(e.to_string()))?;
                Ok(serde_json::to_value(val).unwrap_or(serde_json::Value::Null))
            },
            "list" => {
                let val: Vec<String> = conn.lrange(key, 0, -1).await.map_err(|e| DbError::QueryFailed(e.to_string()))?;
                Ok(serde_json::to_value(val).unwrap_or(serde_json::Value::Null))
            },
            "set" => {
                let val: Vec<String> = conn.smembers(key).await.map_err(|e| DbError::QueryFailed(e.to_string()))?;
                Ok(serde_json::to_value(val).unwrap_or(serde_json::Value::Null))
            },
            "zset" => {
                let val: Vec<(String, f64)> = conn.zrange_withscores(key, 0, -1).await.map_err(|e| DbError::QueryFailed(e.to_string()))?;
                Ok(serde_json::to_value(val).unwrap_or(serde_json::Value::Null))
            },
            _ => Ok(serde_json::Value::String(format!("Unsupported type: {}", key_type)))
        }
    }

    /// 设置 Key 的值
    pub async fn set_key_value(&self, key: &str, value: &str, ttl: Option<i64>) -> DbResult<()> {
        let mut state = self.state.lock().await;
        let conn = state.conn.as_mut().ok_or(DbError::not_connected())?;
        
        if let Some(t) = ttl {
            if t > 0 {
                return conn.set_ex(key, value, t as u64).await.map_err(|e| DbError::QueryFailed(e.to_string()));
            }
        }
        conn.set(key, value).await.map_err(|e| DbError::QueryFailed(e.to_string()))
    }

    /// 删除 Key
    pub async fn delete_key(&self, key: &str) -> DbResult<()> {
        let mut state = self.state.lock().await;
        let conn = state.conn.as_mut().ok_or(DbError::not_connected())?;
        conn.del(key).await.map_err(|e| DbError::QueryFailed(e.to_string()))
    }
}

#[async_trait]
impl DatabaseOperations for RedisDatabase {
    async fn test_connection(&self, config: &ConnectionConfig) -> DbResult<bool> {
        let url = Self::build_redis_url(config);
        let client = redis::Client::open(url).map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        let mut conn = client.get_multiplexed_async_connection().await.map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        let _: String = redis::cmd("PING").query_async(&mut conn).await.map_err(|e| DbError::QueryFailed(e.to_string()))?;
        Ok(true)
    }

    async fn connect(&self, config: ConnectionConfig) -> DbResult<()> {
        let url = Self::build_redis_url(&config);
        let client = redis::Client::open(url).map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        let conn = client.get_multiplexed_async_connection().await.map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        let mut state = self.state.lock().await;
        state.client = Some(client);
        state.conn = Some(conn);
        Ok(())
    }

    async fn disconnect(&self) -> DbResult<()> {
        let mut state = self.state.lock().await;
        state.client = None;
        state.conn = None;
        Ok(())
    }

    async fn check_health(&self) -> DbResult<bool> {
        let state = self.state.lock().await;
        let mut conn = state.conn.clone().ok_or(DbError::not_connected())?;
        let _: String = redis::cmd("PING").query_async(&mut conn).await.map_err(|e| DbError::ConnectionFailed(e.to_string()))?;
        Ok(true)
    }

    async fn execute_query(&self, sql: &str, _database: Option<&str>, _query_id: Option<u64>) -> DbResult<Vec<QueryResult>> {
        let parts: Vec<&str> = sql.split_whitespace().collect();
        if parts.is_empty() { return Ok(vec![]) }
        
        let cmd = parts[0];
        let args: Vec<String> = parts[1..].iter().map(|s| s.to_string()).collect();
        
        let val = self.execute_command(cmd, args).await?;
        
        let mut rows = Vec::new();
        let mut row = HashMap::new();
        row.insert("result".to_string(), serde_json::Value::String(format!("{:?}", val)));
        rows.push(row);

        Ok(vec![QueryResult {
            columns: vec!["result".into()],
            rows,
            affected_rows: 0,
            execution_time_ms: 0,
            messages: Vec::new(),
        }])
    }

    async fn get_databases(&self) -> DbResult<Vec<DatabaseInfo>> {
        Ok((0..16).map(|i| DatabaseInfo { name: format!("db{}", i), charset: None, collation: None }).collect())
    }

    async fn get_tables(&self, _database: Option<&str>) -> DbResult<Vec<TableInfo>> {
        Ok(Vec::new())
    }

    async fn get_table_structure(&self, _table: &str, _schema: Option<&str>, _database: Option<&str>) -> DbResult<Vec<ColumnInfo>> {
        Ok(Vec::new())
    }

    async fn get_indexes(&self, _table: &str, _schema: Option<&str>) -> DbResult<Vec<IndexInfo>> {
        Ok(Vec::new())
    }

    fn as_any(&self) -> &dyn std::any::Any { self }
}
