# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

DataSmith 是基于 Tauri 2.x 的跨平台数据库管理工具，支持 MySQL、PostgreSQL、SQLite、MongoDB、Redis。

**技术栈：**
- 前端：React 19 + TypeScript + Ant Design (antd 5) + Monaco Editor + Zustand + AG Grid Community
- 后端：Rust + Tauri 2.x + Tokio + 原生数据库驱动
- 构建：Vite 5.x + Cargo

## 开发命令

```bash
# 安装依赖
npm install

# Tauri 开发模式（完整应用，自动打开 DevTools）
npm run tauri:dev

# 前端开发（仅 Web 界面，无后端功能）
npm run dev

# 类型检查 + 构建
npm run build

# 生产构建
npm run tauri:build

# Rust 后端
cd src-tauri
cargo build              # 开发构建
cargo build --release    # 发布构建
cargo check              # 快速语法检查
cargo check --features mysql  # 检查特定 feature
```

**注意：** 项目当前没有配置 lint、format 或 test 脚本，也没有测试用例。

## 核心架构

### 后端错误处理（两层转换模式）

1. **领域层** (`database/traits.rs`)：`DbError` 枚举（`thiserror` 派生），9 个变体。`DbResult<T> = Result<T, DbError>`。`Display` 实现为中文消息。
2. **命令层** (`commands/query.rs`)：`ToCommandResult<T>` trait 通过 blanket impl 将任何 `Display` 错误转为 `Result<T, String>`。两种用法：
   - `.to_cmd_result()?` — connection/query 命令使用
   - `.map_err(|e| e.to_string())` — metadata 命令使用

前端接收到的错误始终是字符串。

### 会话管理机制（关键）

**Composite ID 格式：** `config_id:session_id`

- 每个连接配置（config）可以有多个会话（session）
- 默认会话 ID 为 `metadata`（用于元数据查询）
- 查询会话使用自定义 ID（如 `query-1`, `query-2`）
- 不带冒号的 ID 自动追加 `:metadata`

**ConnectionManager 设计（三个独立 `Arc<RwLock<HashMap>>` 实现细粒度锁）：**
- `connections` — `String -> Arc<dyn DatabaseOperations>`（活跃连接）
- `connection_types` — `String -> DatabaseType`（类型缓存）
- `configs` — `String -> ConnectionConfig`（连接配置）

**关键方法：**
- `get_db_ref()` — 乐观获取 + 懒创建：先读锁查找，不存在则触发 `ensure_session()`
- `ensure_session()` — 双重检查锁定模式，自动创建不存在的会话
- `ensure_db_context()` — 确保驱动连接到正确的数据库
- 所有代理方法遵循"获取驱动引用 → 确保数据库上下文 → 委托给驱动"三步模式

### 连接配置双模型设计

- `StoredConnection` (`models/connection.rs`) — 持久化模型，含加密密码、group、color、tags 等字段，存储在 `connections.json`（tauri-plugin-store）
- `ConnectionConfig` (`database/traits.rs`) — 运行时连接参数
- `commands/connection.rs` 中的 `stored_to_config()` 负责两者间转换并解密密码

### Trait 抽象层

所有数据库实现 `DatabaseOperations` trait（`src-tauri/src/database/traits.rs`）：

**核心方法：**
- `connect()` / `disconnect()` — 连接管理
- `execute_query()` — 执行 SQL，返回 `Vec<QueryResult>` 支持多结果集
- `get_databases()` / `get_tables()` / `get_table_structure()` — 元数据查询
- `switch_database()` — 切换数据库（PostgreSQL 需重新连接）
- `get_table_ddl()` — 生成 CREATE 语句
- `explain_query()` — 执行计划分析

**数据库实现：**
- MySQL: `mysql_async` + 连接池
- PostgreSQL: `tokio-postgres` + `deadpool-postgres`
- SQLite: `rusqlite` (bundled)
- MongoDB: `mongodb` crate (optional feature)
- Redis: `redis` crate (optional feature)

**Redis 特殊处理：** Redis 命令不走标准代理模式，通过 `downcast_ref::<RedisDatabase>()` 获取具体类型调用 Redis 特有方法（`execute_command`、`get_server_info` 等不在 trait 中的方法）。

### Feature Flags

在 `Cargo.toml` 中通过 features 控制数据库支持：

```toml
[features]
default = ["mysql", "postgresql", "sqlite", "mongodb-support", "redis-support"]
mysql = []
postgresql = ["deadpool-postgres"]
sqlite = []
mongodb-support = ["mongodb"]
redis-support = ["redis"]
```

编译时使用 `#[cfg(feature = "mysql")]` 条件编译。`database/mod.rs` 中每个模块声明和 `create_instance()` 分支都受条件编译保护。

### 前端架构

**API 层（`src/api/`）：**
前端通过 `@tauri-apps/api/core` 的 `invoke` 函数调用后端。API 按领域分模块（`connectionApi`、`queryApi`、`metadataApi`、`workspaceApi`），统一由 `api/index.ts` 导出。命令名 snake_case，参数用对象字面量传递。

**类型镜像（`src/types/database.ts`）：**
TypeScript 接口与 Rust `traits.rs` 中的结构体一一对应（`ConnectionConfig`、`QueryResult`、`ColumnInfo` 等），字段名完全一致（snake_case），因为 Rust 端 `serde` 序列化后前端直接消费 JSON。

**状态管理（Zustand stores，`src/stores/`）：**
- `connectionStore.ts` — 连接配置和活动连接，操作通过 `withErrorHandler` 包装；组件外经 `useConnectionStore.getState()` 访问
- `workspaceStore.ts` — 标签页会话持久化/恢复，`isRestoring` 防重入
- `appStore.ts` — 全局设置（主题、语言、侧边栏），setter 内同步通过 `storage` 工具持久化
- `rightPanelStore.ts` — 右侧面板状态；cell viewer 的操作回调走 `cellViewerRegistry`（模块级 Map，不进 store）

**前端错误处理（`src/utils/errorHandler.ts`）：**
`withErrorHandler<T>` 高阶函数包装 async 操作，捕获后经注入的 notifier（antd `message.error`，`main.tsx` 注册）显示提示，默认吞掉错误返回 `undefined`。

**组件与 hooks：**
- 组件为 `.tsx` + CSS Modules（`.module.css`），显式 import（无自动导入插件）
- `src/hooks/` 为业务 hooks（useTabManager、useSqlExecution、useWorkspaceSessionLifecycle 等）
- 命令式句柄用 `forwardRef + useImperativeHandle`（如 `SqlEditorHandle`），deps 必须为 `[]`（句柄方法经 ref 读状态）

**Monaco Editor 集成：**
- SQL 语法高亮和自动补全（`services/sqlAutocomplete.ts`），`useMonacoEditor` hook 统一创建/销毁
- Worker 用 Vite `?worker` 方案（`main.tsx` 配置 `MonacoEnvironment.getWorker`）

## 命令注册（Tauri 命令，前端调用点约 74 个命令名）

所有命令在 `main.rs` 的 `tauri::generate_handler![...]` 中注册：
- `commands::connection` — 8 个（CRUD、测试、连接/断开、创建 SQLite 库）
- `commands::query` — 7 个（执行、解释、美化、批量、表结构变更、数据增删改）
- `commands::metadata` — 16 个（库/表/视图/schema/函数/索引/外键/扩展/DDL/自动补全）
- `commands::workspace` — 5 个（会话保存/加载、脚本管理）
- `commands::export` — 4 个（CSV/JSON/SQL/DDL 导出）
- `commands::utils` — 2 个（read_file, write_file）
- `commands::redis` — 5 个（Redis 专用操作）

## Tauri 插件

- `tauri-plugin-store` — 连接配置持久化（`connections.json`）
- `tauri-plugin-dialog` — 原生文件对话框
- `tauri-plugin-fs` — 文件系统访问

## 关键开发注意事项

### PostgreSQL 特殊处理

PostgreSQL 不支持 `USE database` 语句，切换数据库需要断开当前连接并使用新数据库名重新连接。`switch_database()` 方法内部处理此逻辑。

### 密码加密存储

- 使用 SHA-256 从机器 ID 派生密钥（`OnceLock` 确保只初始化一次）
- 使用 AES-256-GCM 加密，nonce 拼接在密文前，整体 Base64 编码
- 初始化：`utils::crypto::initialize_master_key()`

### 日志系统

使用 `tracing` 框架：
- 日志文件位置：应用数据目录 + `/logs/`
- Debug 模式：控制台输出
- Release 模式：文件输出（按日期滚动）
- 使用 `#[instrument]` 宏追踪函数调用

### 无边框窗口

Tauri 配置 `decorations: false`，默认窗口 1400x900（最小 1200x700）：
- 前端实现自定义标题栏
- 使用 Tauri API：`appWindow.startDragging()`

### AppState 设计

`AppState` 只含 `connection_manager: Arc<ConnectionManager>`。移除了全局 Mutex，因为 ConnectionManager 内部已实现细粒度锁。通过 `tauri::State<'_, AppState>` 注入命令函数。

**注意：** `lib.rs` 和 `main.rs` 都定义了 `AppState`，运行时使用 `main.rs` 中的版本。

### 构建优化

**Release 配置：** `opt-level = "z"`, `lto = true`, `strip = true`, `codegen-units = 1`, `panic = "abort"`

**Vite 代码分割：** `react-vendor`、`ant-design`、`ag-grid`、`monaco-editor` 等手动 chunk

## 添加新数据库支持

1. 在 `src-tauri/src/database/` 创建新文件（如 `newdb.rs`）
2. 实现 `DatabaseOperations` trait 的所有方法
3. 在 `database/mod.rs` 添加条件编译模块声明
4. 在 `manager.rs` 的 `create_instance()` 添加条件编译分支
5. 在 `Cargo.toml` 添加依赖和 feature flag
6. 在 `traits.rs` 的 `DatabaseType` enum 添加新类型
7. 前端在 `src/types/database.ts` 和连接配置中添加对应选项

## 常见问题

**编译错误：**
- 缺少数据库驱动：检查 `Cargo.toml` features 配置
- Windows：需要 Visual Studio Build Tools
- Linux：需要 `libssl-dev`, `pkg-config`

**运行时错误：**
- 密钥初始化失败：检查系统可用性（机器 ID 读取）
- 连接超时：检查 `connection_timeout` 配置（默认 10 秒）
- 会话不存在：确保调用 `create_connection` 或 `ensure_session`

**性能优化：**
- 使用 `Arc::clone()` 而非 `Box` 共享数据库连接
- 查询大数据集时使用分页（`execute_query_paged` 命令）
- PostgreSQL 使用连接池（`deadpool-postgres`）
