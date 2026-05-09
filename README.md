# Kudu

Kudu 是一款基于 Tauri 2、Vue 3 和 Rust 构建的轻量级桌面数据库客户端，面向日常查询、结构浏览和轻量数据维护场景。项目重点在于提供稳定、紧凑且一致的桌面数据库工作流体验。

----
# 社区支持

学 AI，上 L 站

[LinuxDO](https://linux.do/)

----

## 软件截图

![Kudu 工作区截图](public/theme.png)

## 支持的数据库

| 数据库 | 支持等级 | 说明 |
|--------|----------|------|
| MySQL | 稳定 | 完整 SQL 工作区、查询构建器、数据对比、表设计器、备份恢复 |
| PostgreSQL | 稳定 | 完整 SQL 工作区、Schema 树、search_path、GUC 参数补全、扩展信息 |
| SQLite | 稳定 | 完整 SQL 工作区、查询构建器、数据对比、备份恢复、文件级连接 |
| Redis | 有限 | Redis 命令行、Key 查看/编辑、TTL 管理、服务器状态信息 |
| MongoDB | 实验性 | 基础连接与集合浏览 |

## 核心能力

### 连接管理

- 多连接配置持久化，支持分组与颜色标签
- 连接测试、连接/断开状态管理
- 连接级只读模式
- 密码 AES-256-GCM 加密存储
- 连接超时与连接池配置
- PostgreSQL `application_name` 标识
- MySQL 字符集与初始化 SQL 设置

### 工作区与标签页

- 多标签工作区，支持 SQL 编辑器、表数据、表设计器、查询构建器、数据对比、Redis 命令行、设置页等多种标签类型
- 会话自动恢复（启动时还原上次打开的所有标签页）
- 连接自动重连
- 标签页右键菜单：关闭当前、关闭左侧、关闭右侧、关闭其他、关闭已保存
- 侧边栏可拖拽调整宽度、可折叠

### SQL 编辑与执行

- 基于 Monaco Editor 的完整 SQL 编辑体验
- 执行光标所在语句（支持 MySQL / PostgreSQL / SQLite 方言识别）
- 当前语句浅色背景高亮
- 执行全部、执行选中、取消查询
- SQL 格式化
- 执行计划分析（EXPLAIN）
- 执行历史搜索与自动保存
- SQL 片段管理（保存/加载/删除）
- SQL 文件保存与打开（关联本地 `.sql` 文件）
- SQL 自动补全：表名、列名、数据库名、函数名、关键字、PostgreSQL GUC 参数
- SQL 函数参数 Inlay Hints（参数名提示）
- 补全缓存手动刷新

### 查询结果与数据操作

- 统一结果面板 Tab 体系（错误 / 结果 / 消息分 Tab 展示）
- 多结果集展示
- 结果面板可展开/收起、可拖拽调整高度
- 数据库通知消息捕获（NOTICE / WARNING 等）
- DDL / 无结果集语句显示"执行成功"反馈
- 系统剪贴板统一复制（Ctrl+C 在焦点位于编辑器时优先路由到 Monaco）
- 单元格查看器
- 结果导出：CSV / JSON / SQL INSERT 语句
- 表结构导出为 DDL

### 表数据管理

- 表数据浏览、筛选、排序、分页
- 行级新增、修改、删除预览与提交
- 数据导入（CSV）
- 表清空
- 行级 JSON / INSERT SQL 快速复制到剪贴板

### 表结构设计器

- 列管理：新增、修改、删除、重排序
- 索引管理：新增、删除索引
- 外键管理：新增、删除外键
- 在线表结构变更预览与执行（生成 ALTER TABLE 语句）

### 查询构建器

- 可视化选择数据库、表、列
- SELECT / WHERE / ORDER BY / GROUP BY / LIMIT 子句配置
- JOIN 多表关联
- 生成 SQL 并发送到编辑器执行

### 数据对比工具

- 选择同一服务器上不同数据库/表进行数据对比
- 行级差异展示

### PostgreSQL 专有功能

- Schema 树浏览（支持多 Schema）
- search_path 配置
- 函数 / 存储过程 / 聚合函数浏览
- 扩展信息浏览
- GUC 参数名自动补全（SET / SHOW / RESET 语句）
- 表 DDL 生成
- 视图定义查看

### Redis 专有功能

- Redis 命令行交互
- 命令自动补全（Redis 7.x 命令集）
- Key 值查看与编辑
- TTL 管理
- 服务器 INFO 信息面板
- 多数据库切换

### 全局功能

- 全局搜索（跨数据库对象搜索）
- 深色 / 浅色 / 跟随系统 三档主题切换
- 中英文界面切换
- 自定义界面字体与编辑器字体（自动读取系统已安装字体列表）
- 编辑器字体大小、行号显示、Minimap 开关
- 无边框窗口，自定义标题栏
- 日志系统（trace / debug / info / warn / error 五级），文件按日期滚动

## 技术栈

- **前端**：Vue 3、TypeScript、Pinia、Ant Design Vue、Monaco Editor、VXE Table
- **桌面端**：Tauri 2（无边框窗口、原生文件对话框、安全存储）
- **后端**：Rust、Tokio 异步运行时
- **数据库驱动**：tokio-postgres、mysql_async、rusqlite、mongodb、redis（全部原生 Rust 驱动）
- **构建**：Vite 5.x + Cargo
- **加密**：AES-256-GCM 密码加密、Argon2 密钥派生

## 项目状态

- **当前版本**：`0.1.0`
- **当前重点**：打磨核心工作流、SQL 编辑体验与桌面交互细节
- **测试现状**：仓库暂未包含自动化测试套件

建议在发布前至少完成以下验证：

```bash
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

## 本地开发

### 环境要求

- Node.js 18+
- Rust stable（1.77+）
- 各平台 Tauri 2 构建依赖：
  - **Linux**：`libwebkit2gtk-4.1-dev`、`libssl-dev`、`libgtk-3-dev`、`libayatana-appindicator3-dev`、`librsvg2-dev`、`pkg-config`
  - **macOS**：Xcode Command Line Tools
  - **Windows**：Visual Studio Build Tools（C++ 桌面开发）、WebView2

### 安装依赖

```bash
npm install
```

### 前端开发（仅浏览器界面，无后端功能）

```bash
npm run dev
```

### 桌面联调（完整应用，自动打开 DevTools）

```bash
npm run tauri:dev
```

### 生产构建

```bash
npm run build
npm run tauri:build
```

### Rust 后端单独编译检查

```bash
# 快速语法检查
cargo check --manifest-path src-tauri/Cargo.toml

# 开发构建
cargo build --manifest-path src-tauri/Cargo.toml

# 发布构建
cargo build --release --manifest-path src-tauri/Cargo.toml
```

## 项目结构

```text
src/                         Vue 前端
├── api/                     Tauri invoke 封装（connection/data/export/metadata/query/redis/utils/workspace）
├── components/
│   ├── connection/          连接管理组件（连接面板、连接对话框）
│   ├── database/            数据库操作组件（树节点、表设计器、导入导出、备份恢复对话框）
│   ├── data/                数据展示组件（表数据表格）
│   ├── editor/              SQL 编辑器、Redis 编辑器、代码片段管理
│   ├── layout/              应用标题栏、SQL 工具栏
│   ├── search/              全局搜索
│   ├── settings/            设置面板
│   └── tools/               查询构建器、数据对比
├── composables/             组合式函数（标签管理、SQL 执行、Monaco、历史记录等）
├── locales/                 i18n 翻译文件（zh-CN、en-US）
├── services/                SQL/Redis 自动补全服务
├── stores/                  Pinia 状态管理（app、connection、workspace）
├── types/                   TypeScript 类型定义
├── utils/                   工具函数（剪贴板、错误处理、数据库支持配置等）
└── views/                   路由视图（主页、设置页）

src-tauri/                   Rust + Tauri 后端
├── src/
│   ├── commands/            Tauri 命令处理器（35+ 命令）
│   ├── database/            数据库驱动实现（mysql / postgresql / sqlite / mongodb / redis）
│   ├── models/              持久化数据模型
│   └── utils/               工具（日志、加密、SQL 格式化/净化/脚本解析）
├── icons/                   应用图标
├── gen/                     Tauri 生成的模式文件
└── capabilities/            权限声明

public/                      前端静态资源
docs/                        发布说明与项目文档
```

## 上游项目与许可证

Kudu 基于上游项目 [Rabb1tQ/DataSmith](https://github.com/Rabb1tQ/DataSmith) 继续开发，并沿用 **GPL-3.0** 许可证要求进行分发。发布二进制时需同时提供对应版本的完整源代码。

详细的发布合规说明请参阅 [docs/release-and-gpl-notes.md](docs/release-and-gpl-notes.md)。
