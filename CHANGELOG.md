# Changelog

All notable changes to Kudu will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.1] - 2026-05-27

### Added / 新增
- GaussDB and openGauss database engine support.
  新增 GaussDB 和 openGauss 数据库引擎支持。
- PostgreSQL: partitioned table, enum type, domain type, and composite type support.
  PostgreSQL：支持分区表、枚举类型、域类型和复合类型。
- PostgreSQL: materialized view support and expanded sequence support.
  PostgreSQL：支持物化视图，扩展序列支持。
- PostgreSQL: schema management (create/alter/drop) and admin inspection actions.
  PostgreSQL：Schema 管理（创建/修改/删除）及管理检查操作。
- PostgreSQL: enriched index metadata display (INCLUDE columns, predicates).
  PostgreSQL：增强索引元数据显示（INCLUDE 列、谓词）。
- PostgreSQL: dynamic GUC parameter autocomplete for SET/SHOW/RESET.
  PostgreSQL：SET/SHOW/RESET 的 GUC 参数动态自动补全。
- PostgreSQL: search_path selection in toolbar.
  PostgreSQL：工具栏中支持 search_path 选择。
- Focused ER diagram workspace with entity relationship visualization.
  专注的 ER 图工作区，支持实体关系可视化。
- Workspace status bar showing connection and database context.
  工作区状态栏，显示连接和数据库上下文。
- Database tree: grouped table columns, indexes, foreign keys, constraints, and rules.
  数据库树：分组展示表列、索引、外键、约束和规则。
- Database tree: table row count statistics, generate SQL, truncate, delete, and copy column names.
  数据库树：行数统计、生成 SQL、清空/删除表、复制列名。
- Database tree: table size badges and enhanced search (regex, case-sensitive, column name search with highlight and match count).
  数据库树：表大小徽章，增强搜索（正则、大小写、列名搜索 + 高亮 + 匹配计数）。
- Database tree: view node context menu (view data, definition, generate SELECT, delete).
  数据库树：视图节点右键菜单（查看数据/定义/生成 SELECT/删除）。
- Context menu: scroll/positioning improvements, multi-table delete, table rename.
  右键菜单：滚动/定位优化，多表删除，表重命名。
- SQL editor: execute current statement with light background highlight.
  SQL 编辑器：执行光标所在语句 + 浅色背景高亮。
- SQL editor: function parameter Inlay Hints for PostgreSQL functions.
  SQL 编辑器：SQL 函数参数 Inlay Hints 提示。
- SQL editor: DDL/no-result-set statement success feedback.
  SQL 编辑器：DDL/无结果集语句显示执行成功反馈。
- SQL editor: stop button with elapsed time display.
  SQL 编辑器：停止按钮 + 执行耗时显示。
- SQL editor: unified result panel (tab system + independent message panel + DB notification capture).
  SQL 编辑器：统一结果面板（Tab 体系 + 独立消息面板 + 数据库通知捕获）。
- Automatic database connection health monitoring with auto-reconnect.
  自动数据库连接健康监控 + 自动重连。
- About section with application info dialog.
  关于页面与应用信息对话框。
- Startup splash animation.
  启动动画。
- OS font detection for font settings.
  从操作系统读取已安装字体，修复字体设置不生效问题。

### Changed / 变更
- Toolbar redesigned to horizontal layout for better space utilization.
  工具栏改为水平布局，空间利用更高效。
- All context menus unified to professional style (small border radius, compact line height).
  统一所有右键菜单为专业风格（小圆角 + 紧凑行高）。
- SQL editor scrollbar width reduced for cleaner appearance.
  SQL 编辑器滚动条宽度减小，外观更简洁。
- PostgreSQL object info panel enriched with additional metadata fields.
  PostgreSQL 对象信息面板增加更多元数据字段。
- Right-side panels unified into a single detail panel.
  右侧面板统一为单一详情面板。
- Improved PostgreSQL routine CALL SQL generation.
  改进 PostgreSQL 存储过程/函数 CALL SQL 生成。
- PostgreSQL views now load correctly by schema in database tree.
  PostgreSQL 视图按 schema 正确加载到数据库树。
- AppStatusBar height and spacing increased for better visibility.
  AppStatusBar 高度和间距增加，提升可见性。
- Tree metadata presentation refined for clarity.
  优化树节点元数据展示。

### Fixed / 修复
- Inlay Hints: parameter separator no longer misidentifies commas inside strings, comments, or dollar-quoted strings.
  Inlay Hints：参数分隔不再误判字符串、注释或 $ 引用内的逗号。
- Inlay Hints: ARRAY[] and type cast `[]` brackets no longer break parameter detection.
  Inlay Hints：ARRAY[] 和类型转换 [] 内的逗号不再干扰参数检测。
- Inlay Hints: newline handling positions hints at actual parameters, not whitespace.
  Inlay Hints：换行后定位到实际参数位置而非空白处。
- Inlay Hints: each parameter now shows its own hint with variable name only.
  Inlay Hints：每个参数独立提示 + 仅显示变量名。
- Inlay Hints: empty tag regex matching fixed.
  Inlay Hints：修复空标签正则不匹配的问题。
- Current statement detection: PostgreSQL dollar-quoted string (`$tag$`) support.
  当前语句检测：支持 PostgreSQL $ 引用字符串。
- Current statement highlight no longer includes leading blank lines.
  当前语句高亮不再包含前导空行。
- Connection test no longer hangs — added connection timeout.
  测试连接不再卡死 — 添加连接超时。
- Connection failure no longer shows false "connected" toast.
  连接失败后不再误显示"连接成功"提示。
- Database list now loads on startup by listening to connection state changes.
  启动后数据库列表正常加载 — 监听连接状态变化。
- Empty workspace now shows "no open editors" instead of "loading".
  空工作区显示"暂无打开的编辑器"而非"加载中"。
- New SQL editor no longer pre-fills placeholder text.
  新建 SQL 编辑器不再预填占位文本。
- "Open file location" moved to tab title context menu.
  "打开文件所在目录"移到标签页标题右键菜单。
- Unsaved close dialog: discard label added, confirmation flow fixed.
  未保存关闭对话框：添加丢弃标签，修复确认流程。
- Event listener leaks fixed; SqlEditor type safety improved.
  修复事件监听泄漏 + SqlEditor 类型安全改进。
- Last `catch(any)` → `catch(unknown)` for stricter type checking.
  所有 catch(any) 替换为 catch(unknown)。
- PostgreSQL procedures hidden (not supported as independent nodes).
  PostgreSQL 存储过程节点已隐藏。
- Tree expanded descendants properly reset on refresh.
  刷新后正确重置树的展开后代节点。
- Result/message panel resizer usability improved.
  结果/消息面板拖拽调整大小体验优化。
- SQL workspace panel interactions refined.
  SQL 工作区面板交互优化。
- SQL autocomplete restored after editor lifecycle refactoring.
  编辑器生命周期重构后恢复 SQL 自动补全。
- Restrictive path validation removed for file read/write operations.
  移除文件读写时过于严格的路径校验。
- Missing object panel badge labels added.
  补充缺失的对象面板徽章标签。
- Localized remaining workspace UI text.
  补全工作区界面文本的国际化翻译。

### Performance / 性能优化
- Windows startup white screen (~3.6s) resolved via deferred loading.
  修复 Windows 启动白屏约 3.6 秒问题（延迟加载）。
- N+1 queries, serial reconnection, and high-frequency event handling optimized.
  修复 N+1 查询、串行重连、高频事件等性能问题。
- Startup tracing and load behavior improved.
  改进启动追踪和加载行为。
- Removed `deadpool-postgres` in favor of direct parameterized queries.
  移除 deadpool-postgres，改用直接参数化查询。
- Monaco editor, Ant Design, and VXE Table now lazy-loaded to reduce initial bundle size.
  Monaco 编辑器、Ant Design、VXE Table 改为延迟加载，减小初始打包体积。

### Refactored / 重构
- SqlEditor.vue split from 1562 to 674 lines; execution pipeline and history extracted.
  SqlEditor.vue 拆分（1562→674 行），提取执行管线与历史记录。
- `any` types eliminated in DatabaseTree, Connection, and TableDesigner modules.
  消除 DatabaseTree、Connection、TableDesigner 中的 any 类型。
- Duplicate code eliminated; TableDataGrid type safety strengthened.
  消除重复代码，加强 TableDataGrid 类型安全。
- Shared UI styles and theme tokens unified across components.
  统一组件间的共享 UI 样式和主题 Token。
- SQL document lifecycle unified for consistent editor behavior.
  统一 SQL 文档生命周期，确保编辑器行为一致。
- Home view workspace logic split into focused composables.
  拆分主页工作区逻辑为独立 composable。
- File manager API and runtime registrations isolated for lazy loading.
  隔离文件管理器 API 和运行时注册，支持延迟加载。
- PostgreSQL connection pool switched to parameterized queries via `sqlx`.
  PostgreSQL 连接池切换为 sqlx 参数化查询。

### Documentation / 文档
- README updated with detailed feature list and project structure.
  README 更新，补充详细功能列表和项目结构。
- PostgreSQL feature roadmap added.
  新增 PostgreSQL 功能路线图。
- Community support links added.
  添加社区支持链接。
- PostgreSQL schema implementation guide removed (superseded by roadmap).
  移除 PostgreSQL Schema 实现指南（已被路线图替代）。

---

## [0.1.0] - 2026-03-27

Initial release. / 首次发布。
