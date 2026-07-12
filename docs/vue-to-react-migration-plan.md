# Kudu 前端 Vue → React 迁移计划（v2）

> 本文档基于 2026-07-09 对 `src/` 全量代码的逐文件考察重写（入口/配置/store 逐行核对，五大业务域并行深读），
> 取代旧版计划。旧版的切片框架被保留并修正，本版补齐了三件事：
> **① 每个决策"为什么这么做、放弃了什么备选"；② 迁移过程中必须保护的行为合约（基于事实而非猜测）；③ 迁移完成后的最终结果长什么样。**
>
> 使用方式：按第 6 章切片顺序执行，一次一个切片；每个切片完成后由使用者按"验收"清单确认，确认通过才进入下一片。

---

## 1. 迁移背景与目标

### 1.1 为什么要迁移到 React

仓库中没有记录迁移动机的正式文档，以下是此类迁移通常成立的理由，列出供确认（若与实际动机不符，请修订本节而不必改后续章节——后续章节只依赖"决定迁移"这个前提）：

1. **生态与第三方库**：数据工具类应用重度依赖高性能表格、虚拟化、图形库。这类库的一线选项（AG Grid、TanStack 系列、React Flow 等）对 React 的支持最完整、更新最快；Vue 生态对应物（如本项目使用的 VXE Table）社区规模和长期维护确定性弱一档。
2. **类型检查一致性**：Vue SFC 模板需要 `vue-tsc` 单独检查，模板内的类型推断能力弱于 TSX；React 全程 TSX，类型即代码。
3. **范式统一**：当前代码混用模板指令、`h()` 渲染函数、`defineExpose` 命令式句柄、字符串反射调用（`callActiveEditor`）等多种范式；迁移是一次把它们统一到单一函数式范式的机会。
4. **团队/协作因素**：React 人才池与 AI 辅助编码的语料覆盖均更大。

### 1.2 目标

- 将 Vue 3 前端整体迁移为 React + TypeScript，**用户可感知行为不变**（详见第 9.1 节"行为不变清单"）。
- Rust/Tauri 后端 **0 改动**：74 个 Tauri command 调用点的命令名与参数结构原样保留。
- 用户已有数据 **0 迁移成本**：连接配置（`connections.json`）、工作区会话（`session.json`）、15 个 localStorage key 全部原格式复用。
- 迁移全程可运行、可验证：每个切片结束时应用能启动，且该切片的功能可以被人工确认。
- 迁移完成后移除全部 Vue 生态依赖，留下一个结构清晰的 React 工程。

### 1.3 非目标

- 不重写 Rust 后端、不新增后端 API。
- 不做 UI 重设计（外观、布局、交互保持现状；样式实现方式可以变，视觉结果不变）。
- 不在迁移中"顺手"修复业务逻辑缺陷（第 2.5 节列出的已知业务问题**保持原行为**迁移；只允许修复第 9.5 节列出的"纯技术性、用户不可见"问题）。
- 不补齐完整测试体系；仅对少数纯函数补充低成本单测（见 D11）。

---

## 2. 现状盘点（迁移的事实基础）

> 本章数据为 2026-07-09 实测，旧版文档中与此冲突的数字以本章为准。
> 注意：根目录 `CLAUDE.md` 中"35 个 Tauri 命令"的说法已过时，实测前端共 **74 个不同命令名**的调用点。

### 2.1 规模与构成

| 类别 | 数量 | 说明 |
|---|---|---|
| 前端源码总量 | ≈ 22,760 行 | 40 个 Vue SFC + 64 个 TS 文件 |
| 语言文件 | 2 × 1,103 行 | `locales/zh-CN.json` / `en-US.json` |
| 全局样式 | 490 行 | `style.css`（含 antd 覆盖、滚动条、Monaco 兜底字体） |
| 主题 token | 212 行 | `theme/tokens.ts`，≈90 个 CSS 变量，亮暗两套 |
| Pinia store | 4 个 | app（201 行）/ connection（239）/ workspace（100）/ rightPanel（141） |
| Composables | 19 个 | 其中 9 个是 HomeView 专属的 workspace 系列 |
| Tauri 命令调用点 | 74 个 | 全部集中在 `src/api/*` 与 `src/services/*`，唯一例外：`GlobalSearch.vue` 直接 `invoke` 了 `get_procedures`/`get_functions` |

体量 Top 10（迁移工作量的主要来源）：

| 文件 | 行数 | 备注 |
|---|---|---|
| `components/database/DatabaseTree.vue` | 2,843 | 树 + 约 20 类节点右键菜单 + 前端拼 DDL 执行，最大风险点 |
| `components/editor/SqlEditor.vue` | 1,295 | 上帝组件：Monaco/结果 dock/分页/剪贴板/导出/拖拽全在一个文件 |
| `components/data/TableDataGrid.vue` | 979 | VXE 编辑网格 + pending changes 模型 |
| `components/database/TableDesigner.vue` | 824 | + 3 个子组件（Columns/Indexes/ForeignKeys 共 ≈500 行） |
| `components/settings/SettingsContent.vue` | 699 | 12 个设置项，全部即时保存 |
| `components/editor/RedisEditor.vue` | 623 | + 4 个 Redis 子组件（共 ≈760 行） |
| `components/tools/QueryBuilder.vue` | 586 | 纯前端 SQL 拼接 |
| `views/HomeView.vue` | 554 | 组合根：11 个 composable 的装配点 |
| `components/search/GlobalSearch.vue` | 521 | 前端全量拉取 + 客户端过滤 |
| `components/tools/ErDiagram.vue` | 518 | 自绘 SVG + CSS transform，无第三方图库 |

### 2.2 分层耦合分析：哪些代码能直接带走

这是本次考察最重要的结论——**约 5,500 行代码与框架无关，可以原样（或近似原样）进入 React 工程**：

**✅ 零 Vue 依赖，直接复用**

- `src/api/*`（8 个模块，≈780 行）：纯 `invoke` 封装 + 类型。
- `src/types/database.ts` / `internal.ts` / `sqlExecution.ts`：纯类型（与 Rust serde 字段一一对应）。
- `src/services/sqlAutocomplete.ts`（454 行）：纯 TS 单例 class，内部用原生 Map/Set，自带缓存与并发去重。
- `src/services/redisAutocomplete.ts`（212 行）：静态命令表 + Monaco provider。
- `src/utils/` 中的 clipboard / storageService / databaseSupport / monacoLoader / sqlHelpers / sqlSafety / startupProfiler / tableColumns。
- `src/theme/tokens.ts`、`src/locales/*.json`、`src/style.css`（绝大部分）。

**⚠️ 少量解耦后复用（共 4 个文件，解耦点都已定位）**

| 文件 | 耦合点 | 解法 |
|---|---|---|
| `utils/errorHandler.ts` | 第 1 行 `import { message } from '@/ui/antd'`（antdv） | `getErrorMessage` 原样保留；`withErrorHandler` 的 toast 改为可注入的 notifier（默认接 antd React `message`） |
| `utils/autoReconnect.ts` | 函数体内调 `useConnectionStore()`（Pinia） | Zustand 天然支持组件外 `useConnectionStore.getState()`，改一行调用方式即可，逻辑不动 |
| `utils/storage.ts` | 类型 import 自 `stores/app.ts` 与 `types/rightPanel.ts` | 把 `EditorSettings` 等设置类型抽到 `types/settings.ts`，运行时逻辑零改动 |
| `types/rightPanel.ts` | `component: Component`（Vue 类型）+ cellViewer 回调闭包 | 拆成"纯数据类型"与"面板注册类型"两部分；后者迁移时改 `ComponentType` |

**❌ 必须重写（Vue 范式主体）**

- 40 个 SFC、19 个 composables、4 个 Pinia store、`i18n.ts`、`main.ts`、`App.vue`、`plugins/vxe.ts`、`components/vxe/VxeGridRuntime.ts`、`panelRegistry.ts`。

### 2.3 运行时架构要点（迁移必须理解的 10 个机制）

这些机制是行为等价的关键，每条都标注了 React 侧对策（详见第 4 章）：

1. **HomeView 是唯一组合根**。`useTabManager()` 只在 HomeView 实例化一次（返回 22 个成员），再以**函数参数**显式注入其余 8 个 workspace composable。全项目 **0 处 provide/inject、0 个事件总线**——依赖关系全是显式的，这对迁移是好消息。→ React：一个 `WorkspaceProvider`（或直接保持"在 HomeView 组件里组装 hooks"）即可等价。
2. **Tab 内容双层保活**：antd Tabs 默认不销毁非激活 pane（首渲染后 CSS 隐藏）+ 外面再包一层 `KeepAlive`；`v-if/v-else-if` 链按 `tab.type` 渲染 8 种 tab 组件，全部 `defineAsyncComponent` 懒加载。SqlEditor 依赖 `onActivated` 在 tab 激活时重新 focus/刷新上下文。→ React：常驻挂载 + `display:none`（D9），"激活回调"用 `useEffect` 监听 activeKey 实现。
3. **命令式句柄链**：SqlEditor `defineExpose` 13 个方法/属性，HomeView 用函数式模板 ref 收集进字典，`callActiveEditor('方法名', ...args)` 字符串反射调用；RedisEditor/DatabaseTree/Redis 子组件同模式。→ React：`forwardRef + useImperativeHandle` + 显式类型化的 handle 接口（顺带消灭字符串反射）。
4. **in-place 突变 + deep watch 是全项目最大范式差异**：代码大量直接改 tab 对象字段（`tab.dirty = true`、`tab.database = val`），靠 `watch(dataTabs, {deep:true})` 触发 800ms 防抖会话保存、靠 deep watch 同步右侧面板。表格行对象上也直接挂 `_isNew/_isDeletedPending/_originalData` 标记。→ React：tab 状态必须改不可变更新（immer 可选）；网格行标记随选型重新设计（见 D7）。
5. **每个 SQL tab 一条独立后端会话**：`sessionConnectionId = ${baseConnId}:tab_${tabId||filePath||随机}`，执行/取消/format/set search_path 走会话 id，元数据与补全走基础 id。这是取消查询与 search_path 隔离正确性的前提，**必须逐字保留**。
6. **SQL 执行链已解耦**：`useSqlExecution` 通过 11 个回调注入（getSql/onAppendResults/onDbMessage…），本体不碰编辑器与 store——迁移成本最低的核心逻辑。危险 SQL 确认（5 条规则）、只读拦截、queryId 取消、`prepareSqlScript` 后端拆句 + `can_page` 自动加 LIMIT 100，全在这一层。
7. **会话持久化走 Rust**：`save_session`/`load_session` 命令落盘 `session.json`（snake_case 字段）；前端 800ms 防抖，恢复时对有 filePath 的 query tab 重读磁盘文件、450ms 后并发静默重连相关连接；`isRestoring` 双重防回写。8 种 tab 类型全部可持久化，`dirty/designTab/designAction/autoExecuteNonce` 不持久化。
8. **右侧面板 cellViewer 在 store 里存回调闭包**（onChange/onToggleNull/onFormatJson/onCopy… 6 个函数），由 TableDataGrid 写入、CellViewerPanel 反调。→ React 迁移中唯一需要**重新设计**的状态形态（见 4.4）。
9. **Monaco 集成是手动的且 worker 配置已损坏**：`monacoLoader.ts` 单例动态 import 5 个 ESM 子模块（只含 SQL/Shell 语言）；`main.ts` 的 `getWorkerUrl` 指向 `./monaco-editor/esm/vs/...`，但构建产物中**不存在**这些文件（`vite-plugin-monaco-editor` 在 devDependencies 里却未在 vite.config 启用）——即当前生产版 Monaco 实际在主线程跑。→ 迁移时用 Vite 标准 `?worker` 方案修复（属 9.5 顺带修复清单）。
10. **功能开关矩阵**：`utils/databaseSupport.ts` 按 7 种 db 类型给出 9 个布尔开关（QueryBuilder/DataCompare/ER 图/备份恢复等入口 gating）；但 DatabaseTree 内部的 PG 专有 UI 走的是组件本地 `isPgLike`（含 opengauss/gaussdb）——两套判定并存，迁移时保持并存，不要合并（合并属于行为变更）。

### 2.4 持久化合约清单（迁移期间一个字都不能改）

**localStorage（15 个 key，含两套封装 + 2 个直连 key）**

| key | 写入方 | 备注 |
|---|---|---|
| `theme` `language` `log_level` `sidebar_collapsed` | `utils/storage.ts`（TypedStorage） | **裸字符串存储**（无 JSON 引号），TypedStorage 的 get 先 JSON.parse 失败再回退原串——React 版必须保持此序列化行为 |
| `interface_settings` `editor_settings` `database_settings` `right_panel_settings` | `utils/storage.ts` | JSON 对象 |
| `sql_history`（上限 100） `redis_command_history`（上限 100） `saved_queries`（上限 200） `sql-snippets` `query_categories` | `utils/storageService.ts` | JSON；注意 `sql-snippets` 是中划线命名 |
| `sql_result_panel_height` `sql_result_panel_visible` | SqlEditor 直连 localStorage | 未走任何封装 |

另：`i18n.ts` 启动时直接 `localStorage.getItem('language')`；`right_panel_settings` 读取时有旧 id 迁移逻辑（`data→cell, info→output, properties→object`），需保留。

**后端文件（前端只通过 invoke 访问，React 迁移不碰）**

- `connections.json`（tauri-plugin-store，Rust 侧读写，密码 AES-256-GCM 单独处理）
- `session.json`（snake_case：`open_tabs/active_tab_key/connection_id/file_path/read_only/is_untitled`）

**invoke 合约**

- 74 个命令名与参数字面量（camelCase 参数如 `connectionId`；session state 内部 snake_case）不变。
- 复合连接 id 格式：`config_id:session_id`；SQL tab 会话 `${connId}:tab_${sessionId}`。

### 2.5 已知问题与死代码清单

**死代码/死依赖（迁移中直接删除，无行为影响）**

- `vue-virtual-scroller`：package.json 依赖 + vite manualChunk 配置齐全，但 **src 内 0 处 import**。
- `vite-plugin-monaco-editor`：devDependencies 存在但 vite.config 未启用。
- `services/export.ts`（132 行）：全仓 0 引用（真正在用的是 `api/export.ts`）。
- 死 emit：DatabaseTree 的 `view-structure`/`open-scripts`（声明未触发）、GlobalSearch 的 `design-table`。
- 死字段/死 UI：ExportTableDialog 的 `exportType`（structure/both 分支无实现）、CreateViewDialog 的 `comment`（收集但不进 SQL）、ImportDataDialog 的 `replace` 模式（与 insert 无差别）、`STORAGE_KEYS.app_settings`（无使用方）、树节点 `isAutoExpanded` 字段（无消费者，搜索命中并不自动展开——**保持这个"不自动展开"的现状**）。
- `SettingsView.vue` + `/settings` 路由：全仓无 `router.push('/settings')`，路由宿主实际不可达（设置一律以 workspace tab 打开）→ 支撑 D5"去路由"决策。

**已知业务问题（⚠️ 迁移时保持原行为，不顺手修——修复是迁移后的独立任务）**

1. TableDataGrid 的 where 筛选、QueryBuilder 的值、树右键的各种 DDL 均为**前端字符串拼 SQL**（有注入面）。
2. 变更"SQL 预览"与实际执行路径不一致（预览是前端拼串，执行走参数化后端命令）——TableDataGrid 与 TableDesigner 皆如此。
3. TableDataGrid 无排序功能；无主键的表不能 update/delete（无 rowid 回退）。
4. DataCompare 的数据对比只是两侧 `COUNT(*)` 之差；"生成同步脚本"按钮是 `message.info('开发中')`。
5. GlobalSearch 列搜索是 N+1 全量拉取，无防抖（仅回车触发——这其实是刻意行为，保持）。
6. `hasColumnDefault` 在 sqlHelpers 与 tableColumns 有两个语义不同的实现，两处调用方各用各的——迁移时**保持两份**，合并属行为变更。
7. `useWindowControls` 的 `onResized` unlisten 未清理（这是纯技术泄漏，列入 9.5 顺带修复）。

---

## 3. 总体策略：为什么这样迁，而不是那样迁

每条决策按"**决策 → 为什么 → 被否备选 → 结果**"展开。

### D1：渐进式并行迁移（strangler fig），不做一次性重写

- **决策**：新建 `src-react/` 与现有 `src/` 并存；仓库保持**两个 HTML 入口**（`index.html` = Vue 主线，`react.html` = React 并行版，同一 dev server 同时可访问）；React 侧按切片逐步长出完整应用；结束时删 Vue、目录归位。
- **为什么**：
  - 2.3 万行、零测试覆盖的代码库，一次性重写意味着数周内没有任何可验证产物，回归风险全部堆积到最后一刻爆发。
  - 并行入口让"新旧对照"随时可得：验证 React 切片行为时，同一台机器 10 秒内能启动 Vue 版对比。
  - 每个切片一个 commit，出问题可以精确回退单片。
- **被否备选**：
  - *一次性重写*：风险如上；且用户要求"每完成一个小功能确认一次"，天然排除。
  - *路由级混挂（Vue 与 React 各管几个页面同时在线）*：本应用实际只有一个工作台页面，没有可以按页拆分的边界；微前端式共存的胶水成本远超收益。
- **结果**：迁移期任何一天 `npm run tauri:dev` 都能打开与今天行为一致的 Vue 版；`npm run tauri:dev:react` 打开成长中的 React 版。

### D2：框架无关层原地复用，React 代码直接 import `@/api` 等

- **决策**：`src/api`、`src/types`、`src/services`、`src/utils`（解耦后）、`src/theme`、`src/locales` **不复制、不搬家**，React 代码通过现有 `@` 别名直接引用；等最终清理时随目录一起归位。
- **为什么**：复制会产生两份需要同步维护的真源（迁移期长达数周，期间 Vue 版仍可能修 bug）；这批代码已被证实零 Vue 依赖（2.2 节），没有复制的技术必要。
- **被否备选**：旧版计划的"复制到 src-react/ 或 src-shared/"——放弃，理由如上；`src-shared` 目录也不建（多一层无意义的间接）。
- **结果**：共享层 ≈5,500 行代码迁移成本为 0；4 个耦合文件按 2.2 节表格解耦（都是 10 行内的改动）。

### D3：UI 库选 antd（React 版），配 React 19

- **决策**：`antd` 5.x + `@ant-design/icons` + `@ant-design/v5-patch-for-react-19`；React 19 + react-dom 19。
- **为什么**：
  - 现在用的 ant-design-vue 本就是 antd 设计体系的 Vue 移植，两者 token 系统、组件命名、视觉规格同源——这是"UI 不重设计"约束下唯一近零视觉成本的选择。App.vue 的 `theme.darkAlgorithm` + token 覆盖在 antd React 有一一对应 API。
  - 全项目用到的 antdv 组件约 40 种（各 agent 盘点已列全），antd React 全部有同名对应物。
  - React 19 已稳定一年半，新代码库没有理由从 18 起步；antd v5 官方通过 patch 包支持 React 19。
- **被否备选**：MUI/Radix/shadcn——组件视觉体系完全不同，等于全 UI 重设计，违反非目标。
- **结果**：模板迁移是机械替换（`a-button` → `<Button>`，速查表见 4.5）；`src/ui/antd.ts` 桥接文件改为 re-export antd React 的 `theme/Modal/message/Empty`，全项目 message/Modal.confirm 调用点不用改 import 路径。

### D4：状态管理选 Zustand

- **决策**：4 个 Pinia store → 4 个 Zustand store，保持同名同成员。
- **为什么**：
  - 现有 store 全是 setup 风格（ref + function），Zustand 的 create 语法是最小翻译距离。
  - **组件外访问**：`autoReconnect.ts`、`healthMonitor` 等在非组件环境调 store，Pinia 依赖"应用已安装 pinia"的隐式全局，Zustand 的 `useStore.getState()/setState()` 是一等公民——这两处迁移后反而更干净。
  - **watch 持久化的对等物**：app store 有 6 个 watch 做 localStorage 持久化 + 副作用（setLocale、set_log_level），Zustand 的 `subscribe`（或在 setter 内同步执行）可精确复刻，且时序更可控。
  - 无 Provider 包裹、无 boilerplate，包体 ~1KB。
- **被否备选**：
  - *Redux Toolkit*：为 4 个小 store 引入 action/slice/dispatch 全家桶，纯开销。
  - *Jotai/Recoil 原子化*：与现有"领域 store"形态差距大，翻译距离最远。
  - *纯 Context + useReducer*：connection status Map 高频更新会引发大范围重渲染，还要手写 selector 优化——Zustand 白送的东西。
- **结果**：store 层迁移是低风险机械工作；`storeToRefs` → selector（`useStore(s => s.x)`），细粒度订阅性能持平或更好。

### D5：移除前端路由，不引入 react-router

- **决策**：React 版不装任何路由库。应用就是"一个工作台"；设置页只保留 workspace tab 形态（现状中它已经是主要形态）。
- **为什么**：
  - 实测全仓没有任何代码导航到 `/settings`（唯一的 `useRouter` 在 SettingsView 自己身上，用于返回首页）；设置的真实入口（AppHeader 菜单、状态栏）走的都是 `openSettings()` → 打开 key 为 `'settings'` 的 tab。路由宿主是不可达的死代码。
  - App.vue 里 `route.meta.keepAlive` + KeepAlive 的全部意义就是防止 HomeView 被路由切换销毁——没有路由后这个问题不存在。
  - 桌面应用无 URL 分享/深链需求。
- **被否备选**：旧版计划的 `react-router-dom`——为一个不可达路由引入路由器 + 保活问题，纯负资产。
- **结果**：删掉 `vue-router` 依赖后无对应新增；`SettingsView.vue` 不迁移；App 结构简化为 `ConfigProvider > HomeView`。

### D6：i18n 选 i18next + react-i18next，翻译 JSON 零改动复用

- **决策**：复用 `locales/zh-CN.json` / `en-US.json` 原文件；i18next 配置 `interpolation: { prefix: '{', suffix: '}' , escapeValue: false }` 以兼容 vue-i18n 的单花括号插值。
- **为什么**：实测翻译文件只用了 `{name}` 单花括号插值（约 120 处、30 个变量名），**没有** vue-i18n 的复数管道（`|`）和链接消息（`@:`）——这意味着兼容面只剩插值定界符一项，配置即可解决，2,206 行翻译一行不动。
- **被否备选**：
  - *写脚本把 `{x}` 批量转 `{{x}}`*：改了 2 个大文件的每个插值点，Vue 版共存期间无法共享同一份文件，违反 D2。
  - *自写 mini-i18n*：语言切换、fallback、插值都要自己养，没必要。
- **结果**：`$t('key', {n})` → `t('key', {n})` 机械替换；语言初始化逻辑（localStorage `language` → navigator.language → fallback en-US）原样移植。

### D7：表格选 AG Grid Community（MIT），备选 TanStack Table + Virtual

- **决策**：查询结果表与表数据编辑网格用 `ag-grid-community` + `ag-grid-react`；用 AG Grid 主题变量对齐现有 CSS token；先迁只读结果表，编辑能力按子切片恢复。
- **为什么**（这是本次实测最有价值的选型输入）：VXE 在本项目实际用到的特性面**很窄**——
  - 结果表：纵向虚拟滚动、列宽拖拽、行 hover/当前行、固定行高 36、cell 点击、触底加载、NULL 灰字渲染。**显式关闭**了 VXE 的单元格区域选择（`mouseConfig: {selected: false}`），复制是自实现 TSV，右键菜单是自绘 overlay，排序没做。
  - 数据网格：上述 + 双击进入 cell 编辑（仅 input 一种编辑器）、checkbox 列（fixed left）、列拖拽重排、cell 动态 class（modified 黄/new 蓝/pending-delete 红）。
  - 以上全部落在 **AG Grid Community（免费 MIT）能力圈内**：row virtualization、column resize/reorder、pinned column、checkbox selection、cell editing、cellClassRules、onBodyScroll、cellRenderer。Enterprise 独占的 range selection/剪贴板/内建右键菜单本项目**恰好都没用**——不需要付费版。
- **被否备选**：
  - *TanStack Table + Virtual（headless）*：主题融合最好，但列宽拖拽 + 固定列 + 编辑态 + checkbox 全要手搭，估计多 1-2 周工作量。**保留为备选**：若 AG Grid 主题对齐效果不可接受（验收点在 Slice 12），切换成本限于 2 个网格组件内部。
  - *继续用 VXE*：Vue 专用，无 React 版，无此选项。
  - *AG Grid Enterprise*：商业授权，且本项目用不到其独占能力。
- **结果**：`plugins/vxe.ts`、`VxeGridRuntime.ts`、`utils/vxeTheme.ts`、`vxe-table/vxe-pc-ui/xe-utils` 三个依赖全部移除；NULL 渲染/TSV 复制/触底加载等自实现逻辑平移（它们本来就不依赖 VXE）。

### D8：Monaco 保持手动集成，不用 @monaco-editor/react；顺带修复 worker

- **决策**：`monacoLoader.ts`（按需加载 SQL/Shell 语言的单例）原样复用；React 侧写一个薄 `useMonaco` hook 管 create/dispose；**不引入** `@monaco-editor/react`。worker 配置改为 Vite 标准 `new Worker(new URL(...), {type:'module'})` / `?worker` 方案。
- **为什么**：
  - 现有集成深度定制：completion provider 与 model 生命周期绑定（bindModel/unbindModel）、decorations 语句高亮、拖拽结果面板时挂起 automaticLayout、`onKeyUp` 手动 triggerSuggest、每 tab 独立 model。wrapper 组件的抽象层在这些场景下全是阻力。
  - worker 现状是坏的（2.3 节第 9 条）：`getWorkerUrl` 指向构建产物中不存在的路径，Monaco 实际主线程运行。这是"用户不可见的纯技术修复"，符合 9.5 准入。
- **被否备选**：`@monaco-editor/react`——为标准场景设计，上述定制点都要绕过它做，反而更复杂。
- **结果**：编辑器行为不变，语法高亮/补全在 worker 中运行（大 SQL 文件不再卡主线程——这是修复损坏配置的自然收益，不是功能变更）；`useMonacoEditor.ts` 与 SqlEditor 内联实现两套 Monaco 封装在 React 侧统一为一个 hook。

### D9：KeepAlive 的替代——tab 内容常驻挂载 + display:none

- **决策**：工作区 tab 内容全部保持挂载，仅激活项 `display:block`；关闭 tab 才卸载组件。`onActivated` 语义用「监听 activeKey 变化的 effect」实现（激活时 focus 编辑器/刷新上下文）。
- **为什么**：Monaco 实例、结果集、网格滚动位置、执行中状态都活在 tab 组件内部，销毁重建 = 状态丢失 + Monaco 重建开销。Vue 版用 antd Tabs 惰性渲染 + KeepAlive 双保险达成同样效果，React 没有内建 KeepAlive，常驻挂载是社区共识方案。
- **被否备选**：*react-activation 等第三方 KeepAlive*——依赖不稳定的内部 API，不值得为此引入。*状态提升（把编辑器内容全提到 store）*——Monaco 实例本身没法提升，治标不治本。
- **结果**：内存特征与 Vue 版一致（Vue 版本来也是全保活）；注意点：懒加载组件首次激活才 mount（`React.lazy` + 首次激活标记），避免启动时挂载所有 tab。

### D10：样式策略——CSS 变量体系原样保留，scoped CSS 改 CSS Modules

- **决策**：`theme/tokens.ts` ≈90 个 CSS 变量的写入逻辑平移为一个 `useThemeVariables` hook（内容照抄 App.vue 的 watch）；`style.css` 全局样式保留（antdv 专属覆盖段随迁移逐段替换为 antd React 对应类名）；SFC scoped style 迁为同名 `.module.css`；`:deep(.ant-*)` → CSS Modules `:global(.ant-*)`。
- **为什么**：全项目的视觉一致性靠 CSS 变量（`var(--surface)` 等）而非组件库主题——这层与框架无关，是"UI 不变"的最大保险；CSS Modules 是与 scoped CSS 心智最接近、零运行时的方案。
- **被否备选**：*CSS-in-JS（styled-components/emotion）*——antd 5 自带 cssinjs 已经够多了，再引一套增加运行时与心智负担；*Tailwind*——等于重写全部样式，违反非目标。
- **风险提示**（对应旧版 13.5）：antdv 与 antd React 的 DOM 结构不完全相同，`:deep` 深层覆盖（如 `.ant-tabs-content` 高度链、`.ant-modal-confirm-*`）需要逐个在 antd React 下核对——各切片验收里已含"视觉对照"项。
- **结果**：暗色/亮色主题、连接色、图标色板等视觉系统零变化。

### D11：验证策略——构建门禁 + 手动验证矩阵 + 少量纯函数单测

- **决策**：延续"无测试体系"现实：每切片的门禁是 ① TS 编译过 ② 应用能起 ③ 该片手动验收单过。**新增**：对 4 个高价值纯函数补 vitest 单测——`sqlSafety.analyzeSqlSafety/analyzeSqlWrites`、SqlEditor 的 `findCurrentStatement`（迁出为纯函数）、`tokenizeRedisCommand`（同）、session 的 `toRaw/fromRaw` 转换。
- **为什么**：这 4 处是"纯输入输出、回归代价高（危险 SQL 误判/语句边界错切/会话损坏）、测试成本半天"的最优性价比点；其余 UI 行为用手动矩阵覆盖（第 8 章）。
- **被否备选**：*全面补测试再迁移*——工期翻倍，违反非目标；*完全不写测试*——上述 4 处的回归靠手测很难发现。
- **结果**：`npm run build` 始终是硬门禁；vitest 作为 devDependency 引入，仅覆盖纯函数。

---

## 4. 范式转换手册（Vue 模式 → React 模式）

> 迁移每个组件时对照本章。所有模式都在现有代码中实际出现过（标注了出处）。

### 4.1 组件与模板

| Vue（现状） | React（目标） |
|---|---|
| SFC `<template>` 指令 `v-if/v-for/v-show` | JSX 条件/`.map()`/`style.display` |
| `defineProps + withDefaults`、`defineEmits`（如 AppHeader 9 个事件） | props 接口 + `onXxx` 回调 props |
| `v-model:open/value/checked/activeKey`（antdv 双向） | `open/value/checked/activeKey` + `onChange` 受控 |
| 自定义组件 `v-model`（`useDialogModel` 可写 computed；注意 SaveQueryDialog 用 `modelValue`、SqlSnippetsManager 用 `visible`，命名本就不一致） | 统一为 `open + onOpenChange` 受控 props，`useDialogModel` 不再需要 |
| slots：`#tab/#icon/#overlay/#bodyCell/#renderItem/#suffix` 等 | JSX 传 `ReactNode` props / render props（antd React 对应项：Tabs `items[].label`、Button `icon`、Dropdown `menu`、Table `render`…） |
| `defineAsyncComponent`（HomeView×14、面板×3、VxeGrid） | `React.lazy` + `Suspense` |
| 动态组件 `<component :is>`（RightPanelHost） | 组件变量直接渲染 `<panel.Component />` |
| `h()` 渲染函数（Modal.confirm 内容、`:icon="h(X)"`） | JSX |
| `:key` 强制重挂载刷新（RedisKeyViewer 组合 key） | 同款：改 `key` 即可，模式通用 |
| 递归组件隐式自引用（TreeNodeItem） | 显式递归函数组件 |
| 事件修饰符 `@click.stop/@contextmenu.prevent` | 处理器内 `e.stopPropagation()/e.preventDefault()` |
| `unplugin-vue-components` 自动注册（模板里 `a-xxx` 无 import） | 显式 import（一次性机械工作，别漏） |

### 4.2 响应式与状态

| Vue | React | 现状出处 |
|---|---|---|
| `ref/reactive` 组件内状态 | `useState/useRef` | 全部组件 |
| `computed` | `useMemo` / 直接表达式 | 全部组件 |
| 可写 computed（`activeTabDatabase`、SettingsContent 12 个设置项） | getter 用 selector、setter 显式函数 | useTabManager:38 |
| `watch(源, cb)` | `useEffect([deps])` | — |
| `watch(..., {deep:true})` + in-place 突变 | **不可变更新** + 普通 effect；tab 数组每次替换新引用 | HomeView:321、TableDataGrid |
| `watch(..., {immediate:true})` 兼做首载 | `useEffect` 本身首渲染就跑，天然等价 | QueryBuilder/TableDataGrid |
| store 里 watch 做持久化 | Zustand setter 内同步写 storage，或 `subscribe` | stores/app.ts:83-118 |
| `nextTick()` | `flushSync`/`requestAnimationFrame`/effect 排队（按 6 处调用点逐个判断：批量关 tab 前激活→flushSync；聚焦→rAF） | CloseGuards:117 等 |
| `reactive({})` 当 Map 用（编辑器 ref 表、执行状态表） | `useRef(new Map())`（不需要触发渲染的）或 `useState`（需要的） | useTabManager:31 |

**重点：tab 状态的不可变化改造。** 现有代码 15+ 处直接 `tab.xxx = val`。React 版 `useTabManager` 内部统一收敛为 `updateTab(key, patch)` 一个原语（内部 `setTabs(tabs => tabs.map(...))`），所有突变点改调它。800ms 防抖保存改为对 `tabs` 状态的 effect。

### 4.3 命令式句柄

```tsx
// SqlEditorHandle：把 defineExpose 的 13 个成员显式类型化
export interface SqlEditorHandle {
  executeQuery(): Promise<void>
  explainQuery(): Promise<void>
  stopExecution(): void
  focusEditor(): void
  formatSql(): Promise<void>
  clearEditor(): void
  openHistory(): void
  openSnippets(): void
  refreshAutocomplete(): Promise<void>
  setSelectedDatabase(db: string): Promise<void>
  handleDatabaseChange(db: string): void
  handleSystemClipboardAction(a: 'copy'|'cut'|'paste'): Promise<void>
  isExecuting(): boolean          // 原 expose 的 executing ref 改为方法
}
```

- HomeView 的函数 ref 字典 → `useRef(new Map<string, SqlEditorHandle>())`，ref 回调里 set/delete。
- `callActiveEditor('方法名', ...)` 字符串反射 → 类型安全的 `editors.current.get(activeKey)?.executeQuery()`。
- 同模式适用：RedisEditor（switchDatabase）、DatabaseTree（refresh，ConnectionPanel 以 Map 收集）、RedisCommandInput/ResultPanel。

### 4.4 cellViewer 回调闭包的重设计（唯一需要换形态的状态）

现状：TableDataGrid 把含 6 个闭包的对象写进 rightPanel store，CellViewerPanel 反调。函数进 store 在 React/Zustand 下虽然"能跑"，但闭包捕获旧 state 的风险在不可变模型下被放大。

**目标形态**：store 只存**数据**（value/isNull/columnMeta/readOnly/rowSnapshot），外加一个 `ownerId`；操作改为"注册表"模式——TableDataGrid 挂载时 `registerCellViewerActions(ownerId, handlers)`（存进 module 级 Map，不进 store），卸载时注销；CellViewerPanel 按 `ownerId` 取 handlers 调用。数据流向不变，只是把"函数"从响应式状态中拿出来。

### 4.5 antdv → antd React 速查（本项目实际用到的差异点）

| antdv | antd React | 备注 |
|---|---|---|
| `a-modal v-model:open` | `<Modal open onCancel>` | — |
| `Modal.confirm({ content: h(...) })` | `Modal.confirm({ content: <jsx/> })` | 危险 SQL 确认、关闭保护三按钮弹窗（自定义 footer 用 `footer:` 或改受控 Modal 组件） |
| `message.success/error/...` | 同名 | 经 `src/ui/antd.ts` 桥接，改一处 re-export |
| `a-tabs > a-tab-pane` + `#tab` 插槽 | `<Tabs items={[{key,label,children}]}>` | antd React 5 已废弃 TabPane 子组件写法；HomeView/SqlEditor/RightPanelHost 三处 tab 都要按 items 重组 |
| `a-tabs type="editable-card" @edit` | `<Tabs type="editable-card" onEdit>` | 行为同 |
| `a-table #bodyCell` | `<Table columns[].render>` | TableDesigner 三个子组件、CreateTableDialog |
| `a-dropdown #overlay` | `<Dropdown menu={{items}}>` | React 版用 items 数据而非 JSX 子树 |
| `a-form` 校验（ConnectionDialog 动态 rules） | `Form` + `useForm`，rules 概念同 | `FormInstance` 类型同名 |
| `a-empty PRESENTED_IMAGE_SIMPLE` | `Empty.PRESENTED_IMAGE_SIMPLE` | 同 |
| `@ant-design/icons-vue` 图标 | `@ant-design/icons` 同名组件 | 逐个改 import |
| `@iconify/vue` `<Icon icon="logos:mysql">` | `@iconify/react` 同 API | 图标名字符串不变 |

### 4.6 i18n 用法映射

- `useI18n().t` / 模板 `$t` → `useTranslation().t`。
- store/工具里的 `i18n.global.t`（connection store、workspace store 的 settings 标题本地化）→ 直接 import `i18next` 实例的 `t`。
- 初始化：沿用「localStorage `language` → navigator.language → `en-US`」；`setLocale` → `i18next.changeLanguage`（appStore setter 内同步调用，替代原 watch）。

---

## 5. 兼容性红线（每个切片的隐含验收项）

1. **不改** 2.4 节的 15 个 localStorage key 及其序列化格式（尤其 `theme` 等裸字符串）。
2. **不改** session snake_case 字段与 8 种可持久化 tab 类型集合；恢复时 `dirty:false`、settings 标题按语言重取、active key 回退第一个 tab、有 filePath 的 query 重读磁盘、450ms 延迟静默重连——逐条保留。
3. **不改** 74 个 invoke 的命令名与参数名（camelCase 参数、复合 id 格式、`${connId}:tab_${id}` 会话规则）。
4. **不改** `tauri.conf.json` 的 `frontendDist: ../dist`、`devUrl: 1420`、无边框窗口配置（迁移期新增的 `tauri.react.conf.json` 只是 dev 期 beforeDevCommand 覆盖，最终删除）。
5. 危险操作确认（drop/truncate/危险 SQL/删除连接/删除 key…约 15 处 Modal.confirm）与只读连接三层拦截（入口禁用/能力移除/函数守卫）在对应切片中逐个数着迁——这两类是数据安全边界。
6. `index.html` 的启动 splash（内联深色样式）保留——防白屏体验不回退。

---

## 6. 迁移路线图（7 个阶段，28 个切片）

> **排序原则**：依赖驱动（共享层 → 状态 → 壳 → SQL 闭环 → 树/网格 → 长尾 → 收尾），
> 且每个 Phase 结束是一个用户可感知的里程碑。
> **规模标尺**（一名熟悉双栈的全职开发，含自测）：S ≈ 半天，M ≈ 1–2 天，L ≈ 3–5 天，XL ≈ 1–2 周。
> 全程估算 55–75 人日；借助 AI 辅助与既有事实清单可显著压缩，日历时间取决于每片的确认节奏。
> 每片一个 commit（`feat: migrate xxx to react`），完成后更新第 10 章状态表。

### Phase 0 — 基线（Slice 0）｜里程碑：迁移前状态有据可查

**Slice 0：基线验证** ｜规模 S

- 内容：`npm run build`（vue-tsc + vite build）与 `cargo check`（用独立 `CARGO_TARGET_DIR=src-tauri/target-196` 规避旧缓存）各跑一遍，结果记入第 10 章。
- 为什么：后续任何"迁移导致的构建失败"都需要一条干净基线来对照。
- 验收：两条命令通过或失败原因被记录。

### Phase 1 — 并行工程与共享层（Slice 1–4）｜里程碑：React 壳能启动、带主题与双语

**Slice 1：React 工程壳 + 双入口** ｜规模 M ｜**已完成（实现方式较原方案更简）**

- 实际实现（比"entry.ts 运行时开关"更干净——两个独立 HTML 入口，无任何运行时开关代码）：
  - 新增 `react.html`（复刻 index.html 的 splash，script 指向 `/src-react/main.tsx`）；`src-react/main.tsx`、`App.tsx`（占位工作台壳）、`styles/shell.css`、`vite-env.d.ts`。
  - 新增 `tsconfig.react.json`（`jsx: react-jsx`、include 仅 src-react、`@` 仍指 src 以复用共享层、`@react` 指 src-react）。
  - `vite.config.ts`：`@vitejs/plugin-react@^4`（v6 需 Vite 8，当前 Vite 5 故锁 v4），`include` 限定 src-react；rollup 双入口 `{index, react}`；`react-vendor` manualChunk；`@react` 别名。
  - `package.json`：依赖 react/react-dom 19 + @types + plugin-react；build 脚本插入 `tsc -p tsconfig.react.json --noEmit`；新增 `tauri:dev:react` 脚本。
  - 新增 `src-tauri/tauri.react.conf.json`：仅覆盖 `build.devUrl` 为 `http://localhost:1420/react.html`（与主配置合并，beforeDevCommand 继承）。
- **踩坑记录（重要）**：
  1. 给 `unplugin-auto-import` 加 `exclude` 会**覆盖**其默认排除项（node_modules），导致它向 `vue-types` 的压缩产物注入 `import { h } from 'vue'` 与包内单字母变量 `h` 重名，build 报 `Identifier "h" has already been declared`。修复：exclude 必须显式写回 `node_modules`/`.git` 再加 `src-react`。
  2. `tauri.react.conf.json` 若只写 `{ "build": { "devUrl": ... } }`，`tauri dev --config` 合并后可能丢失基础配置的 `beforeDevCommand` → vite 不启动 → React 窗口纯白（连 splash 都没有）。修复：override 文件把 `build` 四个字段写全（beforeDevCommand/beforeBuildCommand/devUrl/frontendDist），无论合并语义深浅都成立。已实测 `tauri:dev:react` 端到端可用（BeforeDevCommand 执行、webview 与 dev server 建立连接、react.html 模块链健康）。
- 验收结果：`npm run build`（vue-tsc + tsc react + vite 双入口）通过；dev server 下 `/` 正常 serve Vue、`/react.html` 正常 serve React（JSX 转换生效）；待使用者跑 `npm run tauri:dev`（回归）与 `npm run tauri:dev:react`（React 壳）确认。

**Slice 2：共享层解耦** ｜规模 M ｜**已完成（2026-07-09）**

- 实际改动（全部在现有 `src/` 内，Vue 版行为零变化）：
  1. 新增 `src/types/settings.ts`：`Theme/ThemeMode/Language/LineNumbersMode/LogLevel/InterfaceSettings/EditorSettings/DatabaseSettings` 从 `stores/app.ts` 抽出；app store 对其 re-export，既有导入方（i18n.ts/AppHeader/SettingsContent/storage.ts）路径不变；`utils/storage.ts` 改从新位置导入——共享层与 Pinia 断开。
  2. `types/rightPanel.ts` 移除 `import type { Component } from 'vue'`；`RightPanelDefinition`（含 Vue 组件引用）移到 `panelRegistry.ts` 本地定义——类型层全部框架无关。
  3. `utils/errorHandler.ts`：`message.error` 改为可注入 `ErrorNotifier`（未注入时降级 console.error）；Vue 侧在 `main.ts` 注册 antdv 实现，行为不变。
  4. `utils/autoReconnect.ts`：`useConnectionStore()` 直连改为 `setAutoReconnectStoreProvider()` 注入（`AutoReconnectStoreAccess` 接口：getConnections/getConnectionOverrides/updateConnectionStatus）；Vue 侧在 `main.ts` 注册 Pinia 包装；未注入时自动重连整体禁用（安全降级）。React 侧将注册 Zustand `getState` 包装。
  5. `api/metadata.ts` 新增 `getFunctions`/`getProcedures`（`RoutineNameInfo` 行类型，带 withAutoReconnect），`GlobalSearch.vue` 的两处裸 `invoke` 收编——**invoke 调用点自此 100% 收敛在 api/services 层**。顺带效果：这两个查询获得与其他元数据调用一致的断线自动重连。
- 调整：原计划中 `useConnectionHealthMonitor` 的解耦**移到 Slice 6**——它是将被 React hook 整体重写的 Vue composable（非共享代码），现在解耦只增加 Vue 侧无谓改动。
- 验收结果：`npm run build` 通过；待使用者对 Vue 版做冒烟（连接/查询/触发一次错误提示/全局搜索函数与存储过程）。

**Slice 3：i18n** ｜规模 S ｜**已完成（2026-07-09）**

- 实际改动：安装 `i18next@26` + `react-i18next@17`；新增 `src-react/i18n/index.ts`——直接 import `@/locales/*.json`（零改动复用），`interpolation: { prefix: '{', suffix: '}' }` 兼容 vue-i18n 单花括号插值（**已用 node 实测 v26 支持**），`nsSeparator: false` 防止文案中的冒号被误解析为命名空间，`escapeValue: false`（React 自带转义）；初始语言回退链与 Vue 版逐字一致（localStorage 裸字符串 → navigator.language → en-US）；`setLocale` 持久化同一 key。`main.tsx` 接入；App 壳用真实 key 演示（common.run 等 4 个简单文案 + `search.results_success` 的 `{n}` 插值 + 中英切换按钮）。
- 验收结果：`npm run build` 通过；待使用者在 `tauri:dev:react` 窗口确认中英文案、插值数字与切换持久化（注意：语言 key 与 Vue 版共享，React 壳里切语言会同步影响 Vue 版语言——这是合约内的预期行为）。

**Slice 4：appStore（Zustand）+ 主题体系** ｜规模 M ｜**已完成（2026-07-09）**

- 实际改动：安装 `zustand@5`、`antd@5.29`、`@ant-design/icons@5`、`@ant-design/v5-patch-for-react-19`。
  - `src-react/stores/appStore.ts`：与 Pinia 版同名成员（themeMode/systemTheme/language/logLevel/sidebarCollapsed/三组 settings + 15 个 setter）；Pinia 的 6 个持久化 watch 改为 **setter 内同步执行**；`theme` computed 改为 `selectTheme` selector + `useAppTheme()` hook；模块级 matchMedia 监听系统主题；启动时同步日志等级到后端（对等 watch immediate）；`setLanguage` 委托 i18n 的 `setLocale` 持久化（单一写入路径）。
  - `src-react/hooks/useThemeVariables.ts`：App.vue 的 ~70 个 `setProperty` 照抄为「CSS 变量名 → token 字段」映射表 + 三个 effect（主题 token/界面字体/编辑器字体），tsc 按 `keyof AppThemeTokens` 校验映射拼写。
  - `src-react/ui/antd.ts`：对等 Vue 版桥接（theme/Modal/message/Empty/FormInstance）。
  - `App.tsx`：`ConfigProvider` 算法与 token 映射照抄 App.vue 的 themeConfig；壳样式全部改用 CSS 变量。`main.tsx`：patch 导入、`antd/dist/reset.css`、注册 errorHandler 的 antd message notifier（Slice 2 埋的注入点此处闭环）。
- 验收结果：`npm run build` 通过；待使用者确认三态主题切换/重启保持/antd 组件着色/message 弹出。注意 `theme`/`language` key 与 Vue 版共享（合约内行为）。

### Phase 2 — 应用骨架（Slice 5–9）｜里程碑：能连库、能开关 tab、重启恢复会话

**Slice 5：窗口控制 + 布局壳** ｜规模 M ｜**已完成（2026-07-09）**

- 实际改动（安装 `@iconify/react`，图标名字符串与 Vue 版完全一致）：
  - `hooks/useWindowControls.ts`：Tauri 窗口三键 + isMaximized 状态；**顺带修复 Vue 版的 onResized unlisten 泄漏**（effect cleanup 释放）；非 Tauri 环境（纯浏览器调试）降级 no-op。
  - `hooks/useSidebarResize.ts`：pointer capture + rAF 节流 + 全局 col-resize 光标，逻辑逐行平移；宽度不持久化（与 Vue 版一致）。
  - `components/layout/AppHeader.tsx + .module.css`：拖拽底层/logo/文件·视图菜单（antd Menu items API 重组，含 divider 与条件项）/主题下拉（选中态绑定 themeMode）/搜索按钮/自绘窗口三键/`data-tauri-drag-region` 分层；scoped `:deep` 全部转为 CSS Modules `:global`（antd React 与 antdv 同用 rc-menu 类名，覆盖直接生效）。
  - `components/layout/AppStatusBar.tsx + .module.css`：六个 props 同名平移；右侧 "i" 按钮改为 `rightPanelCollapsed/onToggleRightPanel` 占位 props（Slice 13 接 store）。
  - `views/HomeView.tsx + .module.css`：布局骨架（侧栏宽度/折叠/拖拽条/工作区空态/状态栏占位数据）；业务菜单动作以 message.info 占位；根节点带 `dark-mode` 全局类（对齐 Vue 版）。
  - `styles/global.css`（替代 shell.css）：box-sizing/`--header-height: 32px`/user-select 策略（可编辑区域白名单）照抄 style.css 基础段。
  - `useThemeVariables` 改用 `useLayoutEffect`（对齐 Vue immediate watch 首帧前生效，避免闪烁）。
- 验收结果：`npm run build` 通过；待使用者确认窗口三键/标题栏拖动/侧栏拖宽与折叠（视图菜单）/主题下拉/状态栏渲染。

**Slice 6：connectionStore（Zustand）** ｜规模 M ｜**已完成（2026-07-09）**

- 实际改动：
  - `stores/connectionStore.ts`：Pinia 版 17 个成员逐一对齐（fetchConnections promise 去重、toStoredConnection/applyDatabaseDefaults（MySQL 默认 charset/init_sql 注入自 appStore）、PG 系连接成功取 search_path、testConnection 抛错语义、getConnectionOverrides）。**范式转换重点**：connectionStatuses/searchPaths 两个 Map 从 Pinia 的原地 set/delete 改为整体替换新 Map（否则 Zustand 订阅不更新）；connections 数组同理不可变更新。错误前缀文案走 i18next 同名 key。
  - `hooks/useConnectionHealthMonitor.ts`：10s 轮询/connected·error 才检查/失败降 error·恢复升 connected/console 记录格式逐行平移；store 经 `getState()` 读取（Slice 2 计划的"参数注入"在 Zustand 下天然不需要——组件外访问是一等公民）。
  - `main.tsx`：注册 autoReconnect 的 Zustand provider（Slice 2 注入点闭环，React 侧自动重连生效）。
  - `HomeView.tsx`：启动 fetchConnections + 连接数 > 0 启动健康监控（对等 watch immediate）；**临时连接列表 harness**（状态点/连接/断开/测试按钮，Slice 7 替换为正式 ConnectionPanel）；状态栏六项与头部菜单的 QueryBuilder/DataCompare 入口 gating 接通真实连接数据。
- 验收结果：`npm run build` 通过；待使用者验证列表/连接/断开/测试/状态徽章/10s 心跳自动恢复。

**Slice 7：连接面板 + 连接对话框** ｜规模 L ｜**已完成（2026-07-09）**

- 实际改动：
  - `hooks/useContextMenu.ts`：通用右键菜单（坐标 + document 点击外部关闭）平移。
  - `styles/global.css`：从 style.css 补齐共享工具类与变量（`--font-*`/`--space-*`/`--menu-item-height`、`.panel-toolbar` 系、`.info-panel`、`.help-text`、`.text-caption`、`.interactive-row` 系、**`.app-context-menu` 全套**——自绘右键菜单的全局层样式）。
  - `components/connection/ConnectionPanel.tsx + .module.css`：扁平列表/左缘颜色条（`--connection-accent` 内联 CSS 变量）/品牌图标（@iconify logos:*）/四态状态徽章与展开图标（error 显示重连按钮、connecting 转圈）/搜索（name+host 过滤且已连接项始终保留）/搜索选项三复选框/右键菜单（连接/断开/新建数据库/编辑/删除确认）/双击连接或展开/Escape 关闭菜单/启动埋点 fetchConnections。**占位项**：DatabaseTree（Slice 14）、CreateDatabaseDialog（Slice 25，菜单项暂提示）、matchesCount（树接入后上报）。
  - `components/connection/ConnectionDialog.tsx + .module.css`：antd Form 受控重写（`useDialogModel` 可写 computed 模式按计划废除）；全部字段与按类型差异/动态必填规则/新建时切类型填默认端口且 SQLite 清 host·username/8 色板 + 预览/SQLite 选择·新建文件（plugin-dialog + create_sqlite_database + 自动命名）/测试连接（成功含 ping_time_ms、失败 Modal.error）/编辑不回显密码/密码作为独立参数传 save·update（合约红线）/randomUUID。`a-input-group compact` → `Space.Compact`。
  - HomeView 移除 Slice 6 临时 harness，接入正式面板与对话框；对话框开关状态即 Vue 版 useWorkspaceViewActions 对话框部分的对等物。
- 验收结果：`npm run build` 通过；待使用者按 8.2 连接矩阵逐项确认（重点：编辑连接不填密码保存后仍能连）。

**Slice 8：Workspace tabs 基础** ｜规模 L ｜**已完成（2026-07-09）**

- 实际改动：
  - `hooks/useTabManager.ts`：tabs + activeKey 合并为**单一原子状态**（setState 函数式更新保证增删与激活回退的一致性）；`applyTabRemoval` 平移为纯函数；关闭规则（相邻回退 min(index, len-1)、批量回退 fallback → 末位）逐行对齐；**`updateTab(key, patch)` 单一不可变原语**取代 Vue 版 15+ 处 in-place 突变（4.2 节范式核心落地）；`SqlEditorHandle` 类型化接口 + `getActiveEditor()` 取代 `callActiveEditor` 字符串反射（顺带修复清单第 6 项）；编辑器句柄 Map（useRef，不触发渲染）与执行状态 Record（useState，驱动状态栏）分离。
  - `hooks/useWorkspaceTabContextMenu.ts`：右键目标 + 五个"可关闭性"派生值平移。
  - HomeView：antd Tabs editable-card（items API）；**保活策略 D9 落地**——antd Tabs 默认不销毁非激活 pane（与 antdv 行为一致），pane 内容组件按 tab.key 稳定，切换零卸载；tab 标题（连接色点/错误脉冲动画/类型图标/dirty 圆点）；右键菜单六项；untitled-N.sql 编号规则照抄；状态栏改为跟随激活 tab 的连接上下文（statusBarConnection 优先级照抄）。
  - `components/workspace/TabContentPlaceholder.tsx`：占位内容——query tab 是带本地 state 的 textarea（专用于验证保活与 dirty 链路），Slice 10 起被真实组件逐个替换。
- 已知暂缺（按计划后置）：关闭脏 tab 无确认（Slice 26 关闭保护）；打开文件位置菜单项因暂无文件 tab 恒禁用（Slice 10 后可用）。
- 验收结果：`npm run build` 通过；待使用者验证开/关/切、相邻回退、保活、右键菜单、dirty 圆点。

**Slice 9：Workspace 会话** ｜规模 M ｜**已完成（2026-07-10）**

- 实际改动：
  - `src-react/stores/workspaceSession.ts`：toRaw/fromRaw 转换独立为**纯函数模块**（D11 单测前提）——`SESSION_PERSISTABLE_TAB_TYPES`（8 类型全集）、snake_case 映射、active key 回退逻辑逐行平移；settings 标题本地化改为 `translateSettingsTitle` 注入（store 侧传 i18next），`RawSessionState` 仅类型导入（运行时零依赖，node 环境可测）。
  - `src-react/stores/workspaceStore.ts`（Zustand）：isRestoring / saveSession（落盘前二次拦截）/ loadSession（withErrorHandler，前缀与 Vue 版逐字一致）。
  - `src-react/hooks/useWorkspaceSessionLifecycle.ts`：800ms 防抖保存（调度时 + 落盘时双重 isRestoring 防回写）、恢复六步流程（load → 有 filePath 的 query tab 重读磁盘 → 应用 tabs → 连接为空则 fetchConnections → 450ms 静默重连 → 空会话/异常回退默认查询 tab）、startupProfiler 埋点全数保留。**范式差异**：计时器回调经 `latestRef`（每渲染刷新）读最新 tabs，对等 Vue live ref；重连待选 id 从 `restoredTabs` 本地变量收集（React setState 未回流，与 Vue 赋值后读 ref 等价）；Vue 重连回调内的 `nextTick` 无对应物（450ms 触发时渲染早已提交）。
  - `useTabManager` 新增 `replaceAllTabs(tabs, activeKey)` 原语（对等 Vue 版直接写两个 ref）。
  - HomeView：`isSqlSupported` 派生；占位 handleNewQuery 升级为照抄 `useSqlDocumentActions` 的 `openOrCreateQueryTab` 子集（未命名/untitled 双模式编号、SQLite 默认 main 库、filePath 去重激活；文件对话框随 Slice 10）；保存 effect **跳过首帧**（对齐 Vue watch 非 immediate，防止恢复失败时空会话覆盖旧 session.json）；mount 恢复以 ref 防 StrictMode 开发期双执行（否则空会话会建两个默认 tab）。
  - vitest 引入：`vitest@^3`（兼容 Vite 5）devDependency + `npm test` 脚本 + 独立 `vitest.config.ts`（不加载 Vue/React 插件链，仅对齐别名）+ `workspaceSession.test.ts` **10 个用例全过**（字段映射/非持久化字段剔除/类型过滤/双向 active 回退/settings 标题重取/往返一致）。
- 验收结果：`npm run build` 通过、`npx vitest run` 10/10；待使用者验证：开若干 tab 重启全部恢复且 active 正确、SQL 文件 tab 内容从磁盘重读、相关连接 450ms 后自动重连、恢复期间无 save_session 风暴（看后端日志）。

### Phase 3 — SQL 闭环（Slice 10–13）｜里程碑：React 版成为可日常使用的 SQL 客户端，默认入口切到 React

**Slice 10：Monaco 基础** ｜规模 L ｜**已完成（2026-07-10）**

- 实际改动：
  - **worker 修复（9.5-1）**：`src-react/main.tsx` 用 Vite `?worker` 标准方案配置 `MonacoEnvironment.getWorker`（本项目仅 SQL/Shell 两种 basic-language，统一走 editor.worker）；构建产物已验证独立产出 `dist/assets/editor.worker-*.js`——Monaco tokenize 不再占用主线程。
  - `src-react/hooks/useMonacoEditor.ts`：D8 统一封装——创建/销毁 + 设置响应（主题/字号/字体/minimap/行号，对等 Vue immediate watch）；组件专属定制经 `extraOptions`（仅创建时）与 `onReady`（事件/命令/decorations 绑定）注入；`monacoLoader` 单例原样复用。
  - `src-react/utils/sqlStatement.ts`：`findCurrentStatement` 迁出为纯函数 `findCurrentStatementInText(全文, 光标偏移)`（D11），与 Monaco 解耦（组件侧经 getOffsetAt/getPositionAt 互转）；分号/注释/字符串/PG `$$`（含 `$tag$`）分割与关键字行分割逻辑逐行平移；**9 个单测**覆盖（含关键字路径偏移不收缩空白的 Vue 原版怪癖，已用断言固化）。
  - `src-react/components/editor/SqlToolbar.tsx + .module.css`：水平布局全量迁移（执行三键/保存格式清空/历史片段刷新/数据库下拉/search_path Popover 编辑器（标签增删 + SQL 预览 + 确认取消）/结果面板开关）。**Vue 版 vertical 分支不迁移**——它是"保留兼容"的死分支（唯一消费者 SqlEditor 不传 vertical）。
  - `src-react/components/editor/SqlEditor.tsx + .module.css`（Slice 10 子集）：创建参数逐项照抄（quickSuggestions/scrollbar 8px/renderLineHighlight 等）；`sessionConnectionId` 规则逐字保留（红线 3）；语句高亮 decorations（跟随光标与内容变化）；F5/Ctrl+S 命令；onKeyUp 触发补全（Space/Period/A-Z）；补全 bindModel 六个时机照抄（ready/focus/连接切换/连接列表变化/状态恢复 connected/库切换）；数据库下拉 + PG 系 search_path 读写；编辑器剪贴板三动作；formatSql/clearEditor/refreshAutocomplete 实装；执行链/结果 dock/历史/片段按钮为占位提示（Slice 11-12）；`SqlEditorHandle` 经 useImperativeHandle 类型化实现。
  - HomeView：`React.lazy` 挂载 SqlEditor（antd Tabs 默认首次激活才渲染 pane，等价 Vue 惰性 + 保活）；**ref 回调按 tab key 缓存**（防止每渲染 ref 抖动引发执行状态表反复增删）；`onDatabaseChange → updateTab` 对等 handleEditorDatabaseChange；watch(mainTabKey) 聚焦逻辑平移。
  - 范式差异记录：`latestRef` 每渲染刷新供 Monaco 事件回调读最新 props/state（对等 Vue live ref）；`handleDatabaseChange` 先写 ref 再 setState（Vue 写 ref 后同 tick 可读，React setState 异步，须手动同步 latestRef）。
  - **踩坑记录（后续所有带命令式句柄的组件通用——RedisEditor/DatabaseTree 等）**：`useImperativeHandle` 必须给 `[]` deps 让句柄只创建一次——省略 deps 时每渲染生成新句柄，React 对回调 ref 会 `cb(null)`→`cb(新句柄)` 抖动，与「ref 注册即初始化执行状态表」组合成 Maximum update depth 死循环（实测复现）。代价是句柄方法只允许经 ref（latestRef/editorRef/handleActionRef）读状态，不得直接闭包捕获 state。
- 验收结果：`npm run build` 通过、vitest 19/19（新增 sqlStatement 9 例）；待使用者验证：新建查询 tab 可编辑/高亮/补全（表列别名）、切 tab 内容与光标不丢、主题/字号/minimap 即时生效、语句高亮随光标、数据库下拉与 PG search_path 编辑、**DevTools Network/Sources 确认 editor.worker 从独立文件加载**（对比 Vue 版主线程运行）。

**Slice 11：SQL 执行链路** ｜规模 L ｜**已完成（2026-07-10）**

- 实际改动：
  - `src-react/hooks/useSqlExecution.tsx`：11 回调注入结构照抄；危险 SQL 五类确认（Modal.confirm 内容 JSX 化，okType danger/width 720）、只读拦截（analyzeSqlWrites）、queryId 取消与 isStale、`prepareSqlScript` 拆句 + `can_page` 自动加 LIMIT 100、批量执行状态归纳（cancelled/partial_success/failed/success 四分支）、200ms 耗时 ticker、summary 可见性机制——全部逐行平移。**范式差异**：Vue ref 同步读写 → 「useState（驱动渲染）+ useRef 镜像（异步流程内同步读）」，callbacks 经 ref 每渲染刷新。
  - `src/utils/sqlSafety.test.ts`：**9 个单测**（D11）——写前缀识别/注释剥离/五类危险规则（无 WHERE 的 UPDATE·DELETE、TRUNCATE、DROP、batch_write 前 3 条拼接）。
  - `src-react/hooks/useSqlHistory.ts`：`sql_history`（上限 100）+ 日期关键词搜索平移。
  - `SaveQueryDialog.tsx` / `SqlSnippetsManager.tsx`：受控 open/onClose 形态（D 计划废除 useDialogModel 落地）；`saved_queries`（上限 200）/`query_categories`/`sql-snippets`（中划线）三 key 原样；片段默认 7 条内置模板、删除确认、插入编辑器。注意：SaveQueryDialog 在 Vue 版中即无触发入口（showSaveDialog 无 setter，死 UI），React 版保持同等挂载状态。
  - SqlEditor：结果 dock 落地——错误 tab（持久化，独立关闭与回退规则）/进度 tab（状态/statements/结果集/影响行/耗时 + 停止按钮）/结果 tab（**极简 HTML 表格占位**，NULL 灰字，Slice 12 换 AG Grid）；orderedTabs 按创建时间排序；`replaceResultTabs` 关闭回退逻辑照抄；`sql_result_panel_visible` 显隐持久化（高度读取既有 key，拖拽条随 Slice 12）；历史抽屉/片段管理器/工具栏与 F5 全部接真实执行链；autoExecuteNonce 自动执行；executionStateChange 上报 → HomeView 状态栏联动。
  - 暂缺（按计划后置）：结果集复制/导出/右键菜单/触底加载/拖拽条（Slice 12）；`onDbMessage` no-op——NOTICE 等消息随 Slice 13 output 面板接入。
- 验收结果：`npm run build` 通过、vitest 28/28（新增 sqlSafety 9 例）；待使用者按 8.4 矩阵验证：多语句/错误/取消（含双 tab 各自取消）/危险确认五类/只读拦截/格式化/EXPLAIN/历史/片段；执行状态在状态栏与工具栏联动。

**Slice 12：高性能结果表（AG Grid）** ｜规模 L ｜**已完成（2026-07-10）**

- 实际改动：
  - `src-react/components/grid/agGridTheme.ts`：Quartz 基座 `withParams` 全部绑定现有 CSS 变量（`var(--surface)` 等）——亮暗主题随 useThemeVariables 自动切换，无需按主题重建 theme。
  - `src-react/components/grid/ResultGrid.tsx`：AG Grid Community 33.3（AllCommunityModule 注册；React 19 兼容）；按 D7 特性清单配置——行高/表头 36、列宽拖拽、行 hover 与点击选中行、NULL 灰字（valueFormatter + cellClassRules）、对象值 JSON 化、`suppressFieldDotNotation`（防列名含点被解析为深路径）、无排序（保持已知业务问题 3 现状）、`enableCellTextSelection`；触底检测经 `onBodyScroll` + `getVerticalPixelRange` 对齐 Vue 的 scrollTop+50 规则，分页守卫留在调用方。
  - SqlEditor：结果 tab 换 ResultGrid（React.lazy，ag-grid 独立 chunk 929KB 不进首屏）；自实现逻辑平移——cell 点击选中集、TSV 复制（cell/row/结果集，含引号转义）、导出 CSV/JSON/SQL（save 对话框 + exportApi + FROM 表名推断/文件名清洗）、结果 tab 自绘右键菜单（关闭/关左/关右，复用 app-context-menu 全局层）、触底加载 `loadNextPage`（LIMIT/OFFSET 前端拼串现状保留）；**拖拽条**平移（pointer capture + rAF 节流 + 全局光标 + 拖拽期间挂起 Monaco automaticLayout / resume 时 rAF 恢复布局）；`sql_result_panel_height` 挂载时按容器高度收敛 + 变化持久化（拖拽中不写）。queryResultStates/剪贴板选中集改为「state + ref 镜像」对（渲染与异步流程双读）。
  - vite manualChunks 新增 `ag-grid` 分块。
  - **入口切换已执行**：`index.html` → `/src-react/main.tsx`（React 成为默认入口，`npm run tauri:dev` 即 React 版）；`react.html` → `/src/main.ts`（Vue 保留为对照入口，`npm run tauri:dev:react` 打开的是 Vue 版——脚本名不再对应内容，Slice 27 清理时删除）。
- **D7 决策复核点**：主题参数已全量绑定 token，等待使用者视觉验收；若不可接受 → 切换 TanStack，影响面限 ResultGrid 组件内部。
- 验收结果：`npm run build` 通过、vitest 28/28；待使用者验证：10 万行结果滚动流畅、多结果集 tab、复制 cell/行/结果集、导出三格式、触底加载、拖拽条与高度持久化、**AG Grid 视觉与 Vue 版对照**（决策复核）、入口切换后 `npm run tauri:dev` 打开 React 版。

**Slice 13：右侧面板** ｜规模 M ｜**已完成（2026-07-10）**

- 实际改动：
  - `src-react/stores/rightPanelStore.ts`（Zustand）：17 个成员与 Pinia 版逐一对齐；持久化 watch → setter 内同步执行；`right_panel_settings` 读取时保留旧面板 id 迁移（data→cell, info→output, properties→object）与 width clamp 280–560。
  - `src-react/stores/cellViewerRegistry.ts`（**4.4 唯一换形态的状态**）：store 只存 `CellViewerData`（含 ownerId），6 个操作回调移入模块级 Map——TableDataGrid（Slice 17）挂载时 `registerCellViewerActions(ownerId, handlers)`、卸载注销，CellViewerPanel 按 ownerId 反查。消除「函数进响应式状态」的闭包捕获旧 state 风险。
  - `panelRegistry.ts`（`Component` → `ComponentType`，React.lazy）+ `RightPanelHost.tsx`（拖宽 280–560、三面板 items Tabs、visibleWhen 过滤）。
  - 三面板 tsx + module.css：`CellViewerPanel`（经 registry 反查 actions）、`DatabaseOutputPanel`（消息表 + severity pill）、`ObjectInfoPanel`（**27 种对象类型的 detail/list/badge/definition/comment 组装逻辑逐行平移**为纯函数，storage size 格式化等一并迁移）。
  - HomeView：接入 RightPanelHost（内容区末列）；状态栏 "i" 按钮接 `toggleCollapsed`/`collapsed`（替换占位）；激活 tab → `setContext` 的 effect 平移 Vue 版 `watch([activeTab, connections], {deep, immediate})`。
  - SqlEditor：`onDbMessage` 闭环——推入 rightPanelStore（severity/text/time/连接名/库，上限 500）；clearEditor 一并 `clearDbMessages()`。
- 验收结果：`npm run build` 通过、vitest 28/28；待使用者验证：结果格点击 → cell viewer 联动（完整双向编辑随 Slice 17 TableDataGrid）、执行 NOTICE → output 面板（上限 500）、宽度/折叠/激活页持久化、状态栏 i 按钮开合面板。
- 说明：cell viewer 的**双向编辑回写**要等 Slice 17 TableDataGrid 注册 actions 后才完整；本片 output 面板（NOTICE）与 object 面板（激活 tab 属性）已即时可用。

### Phase 4 — 数据库对象（Slice 14–18）｜里程碑：树、表数据、设计器全量对齐

**Slice 14：数据库树基础浏览** ｜规模 L ｜**已完成（2026-07-10）**

- 实际改动（按计划拆分：树本体 + loaders 独立文件 + 显式递归节点组件）：
  - `src-react/components/database/treeModel.ts`：TreeNode 类型 + findNodeInTree/updateNodeInTree/collectSubtreeKeys 纯函数 + `filterTreeData`（正则/大小写/列名三开关、highlight、命中计数）——**匹配计数的 computed 内 emit 副作用改为「useMemo 返回计数 + effect 上报」**（按计划要求）。key 编码规则逐字保留（R3）；`isAutoExpanded` 无消费者现状保持。
  - `src-react/components/database/treeLoaders.ts`：onLoadData 全部引擎分支拆出为 `loadNodeChildren(ctx, node)`——MySQL 四分组 / PG 系 schema 树（extensions/enum/domain/composite）/ 其余两分组 / SQLite 单 main / Redis·Mongo 叶子；表节点六路并发元数据（列/索引/外键/触发器/约束/规则）+ 分区组，节点标题徽章格式照抄。
  - `TreeNodeItem.tsx + module.css`：显式递归函数组件；引导线/展开箭头/加载态/尺寸徽章/搜索高亮；`getIconConfig` 图标映射逐行平移（@iconify 图标名不变）。
  - `DatabaseTree.tsx`：懒加载展开（expandedKeys/loadingNodes）、Ctrl 多选表节点（同库同 schema 约束，供 Slice 15 批量 drop）、双击（分组切换展开 / 表·视图开数据 tab）、选中上报（虚拟分组节点不上报）、连接切换 immediate 加载与连接恢复补加载两个 watch 平移；`handleRefreshNode` 已备好供 Slice 15 菜单复用。树内更新照抄 Vue 策略（updateNodeInTree + 整树浅拷贝）。
  - ConnectionPanel：占位替换为真实 DatabaseTree；searchOptions 下发 + matchesCount 上报接通（多树后报者覆盖，同 Vue）。
  - HomeView：`handleTableSelected`（`table-${connId}-${db}-${table}` key 开/激活数据 tab——内容占位至 Slice 16）/`handleDatabaseSelected`（setActiveConnection + 右面板 context；Redis 分支随 Slice 19）/`handleObjectSelected`（27 类对象 → 右面板 context）——照抄 useWorkspaceTabActions 子集。
  - 暂缺（按计划后置）：右键菜单与全部对象操作、DDL/enum/domain/composite 定义弹窗（Slice 15 五个子批）；数据 tab 内容（Slice 16）。
- 验收结果：`npm run build` 通过、vitest 28/28；待使用者验证：MySQL/PG/SQLite 三树展开层级正确、搜索（普通/正则/大小写/列名）高亮与计数、双击表开数据 tab（占位内容）、点击对象右面板属性联动、树内展开状态切 tab 后保留。

**Slice 15：树右键菜单与对象操作** ｜规模 XL（按 5 个子批交付，每批单独确认）

- 子批：① 基础（refresh/new query/view data/view DDL/copy name）② SQL 生成（gen select/insert/update/delete、copy columns、gen call）③ 结构操作（design/add column/index/fk 定位）④ 危险操作（truncate/drop 表·视图·索引·触发器·约束·schema、批量 drop 多选、rename）⑤ PG 专有（sequence 全套/enum·domain·composite 定义/extension 装卸/vacuum·analyze·reindex/inspect 系列自动执行查询/备份还原入口）。
- 要点：全部菜单动作的 SQL 拼接函数（quoteIdent 按方言）平移为纯函数；每个危险操作数着 Modal.confirm 迁（红线 5）；只读禁用规则照抄。
- 验收：每子批至少在一种引擎实测全部菜单项；危险操作全部有确认。

**进度**：
- **子批①（基础操作）✅ 代码完成（2026-07-10）**：
  - `treeMenu.ts`：按节点类型返回 antd Menu items（子批①项：database/schema/table/view 的 refresh·new-query·view-data·view-ddl、hasDefinition 节点的 view-definition、enum-label/domain-detail 与通用 copy-name）；后续子批在此增量追加。
  - `DdlPreviewModal.tsx`：只读 Monaco 弹窗（对等 Vue showDdlModal），Modal 惰性挂载 + ready 后 setValue。
  - DatabaseTree：菜单基础设施平移——`adjustContextMenuPosition`（下方空间不足则上翻）+ ResizeObserver 二次限位（左边界/高度）改为 effect；`handleMenuClick` 分发 6 个 key（new-query/refresh/copy-name/view-definition/view-data/view-ddl）；view-ddl 走 getViewDefinition（视图）/getCreateTableDdl（表）；双击 metadata.definition 节点弹 DDL；handleRefreshNode 接入。
  - 接线：onNewQuery 经 ConnectionPanel → HomeView openOrCreateQueryTab。
  - 验收结果：`npm run build` 通过、vitest 28/28；**待使用者确认**：右键各节点菜单出现且定位正确（含贴近底部时上翻）、refresh/copy-name/view-data/view-ddl/view-definition 五动作、new query 从库/schema 节点开查询 tab。
  - **待办**：子批②-⑤（SQL 生成 / 结构操作 / 危险操作 / PG 专有）。
- **子批②（SQL 生成）✅ 代码完成（2026-07-10）**：
  - `treeObjectSql.ts`：SQL 拼接纯函数模块（计划要求）——`quoteIdentFor`（方言引用，dbType 用原始 props 值照抄）、`buildTableCrudSql`（SELECT/INSERT/UPDATE/DELETE 模板）、`buildRoutineSignature/Placeholders/CallSql`（参数占位剔除 in/out/inout/variadic + 类型名兜底 argN、procedure→CALL / aggregate→SELECT..FROM / setof·table→SELECT * FROM）、`formatColumnDefinition`、`formatObjectDefinition`（索引 PRIMARY/UNIQUE/USING 分支 + 外键 + definition 兜底）。
  - 菜单新增：表（统计→行数、生成 SQL 四项子菜单、复制列名）、视图/物化视图（gen-select、复制定义）、schema（建表/建视图模板）、函数/过程/聚合（查看定义/复制定义/生成调用 SQL/复制签名——经 getRoutineDefinition，含 oid/identity_arguments 定位与 console 埋点）、列（复制定义）、索引/外键/触发器等表子对象（复制定义——索引走 getIndexDefinition，其余走兜底拼接）。
  - 接线：`onGenerateSql` 经 ConnectionPanel → HomeView `openOrCreateQueryTab`（生成 SQL 开新查询 tab 填充内容，不自动执行——现状语义）。
  - 视图生成非 SELECT 时警告拦截（view_only_select）照抄。
  - 验收结果：`npm run build` 通过、vitest 28/28；**待使用者确认**：表 gen 四类模板含列清单与占位、视图 gen-select、行数统计 toast、复制列名/列定义/视图定义/索引定义/函数签名、gen-call（procedure/aggregate/setof 三种形态）、schema 建表建视图模板。
  - **待办**：子批③-⑤。
- **子批③（结构操作）✅ 代码完成（2026-07-10）**：
  - 菜单新增：表 design-table + 修改表结构子菜单（add-column/add-index/add-foreign-key，只读禁用）、列与索引/外键/触发器等子对象的 open-column-designer（按节点类型定位 columns/indexes/foreign_keys）、物化视图 refresh-materialized-view（确认弹窗 + REFRESH MATERIALIZED VIEW）。
  - `resolveDesignerTarget/openNodeTableDesigner/getTableNodePayload` 逐行平移；只读判定（isSelectedNodeReadOnly）从 connectionStore 订阅。
  - 接线：`onDesignTable` 经 ConnectionPanel（合并 connectionId）→ HomeView `handleDesignTable`（照抄 useWorkspaceTabActions：`design-${connId}-${db}-${table}` key，已存在则 updateTab 更新 designTab/designAction 并激活）。**设计 tab 内容为占位**（TableDesigner 随 Slice 18 迁入，届时消费 designTab/designAction 定位）。
  - 验收结果：`npm run build` 通过、vitest 28/28；**待使用者确认**：设计/加列/加索引/加外键菜单开出 design tab（占位内容，tab 标题正确）、重复打开激活同 tab、只读连接下相关项禁用、物化视图刷新（PG）带确认且执行成功。
  - **待办**：子批④（危险操作）⑤（PG 专有）。
- **子批④（危险操作）✅ 代码完成（2026-07-10）**：
  - **全部危险操作带 Modal.confirm（红线 5，逐个数着迁）**：truncate（成功后整库节点刷新）、drop 表/视图（单个 + Ctrl 多选批量——批量含视图拦截、失败清单部分成功提示、完成清空多选）、drop 列/索引/外键（走 `alterTableStructure` 参数化命令）、drop 触发器/规则/约束（方言 SQL 构建纯函数入 `treeObjectSql`：PG 带 ON 表名 / MySQL schema 前缀 / SQLite 仅名字 / 不支持方言抛错）、drop schema（普通/CASCADE，PG 系限定）。
  - **重命名/建 schema 弹窗**：四模式（table·view·sequence/column/schema/create-schema）；表级按方言（MySQL `RENAME TABLE`、PG `ALTER TABLE/VIEW/SEQUENCE ... RENAME`、SQLite 仅表）；列走 modify_column 参数化（保留全部列属性）；建 schema 支持注释（COMMENT ON + escapeSqlLiteral）；成功后父节点刷新，schema 场景刷新后自动定位选中新名。
  - 菜单新增：表 rename/truncate/drop（批量计数标签）、视图 rename（PG 限定）/drop（**保留 Vue 原版怪癖：视图 drop 项无只读禁用**）、列 rename/drop、索引/外键/触发器/规则/约束 drop、schema 四项 + schemas 节点 create-schema——只读禁用规则照抄。
  - 验收结果：`npm run build` 通过、vitest 28/28；**待使用者确认**：每个危险操作弹确认且取消不执行、批量 drop 多选（含混入视图拦截）、rename 四模式与刷新定位、只读连接全部禁用。
  - **待办**：子批⑤（PG 专有）。
- **子批⑤（PG 专有）✅ 代码完成（2026-07-10）——Slice 15 全部子批交付完毕**：
  - **sequence 全套**：查看/复制定义（getSequenceDefinition，oid 定位）、状态弹窗（last/next/start/increment/is_called）、设值（setval + escapeSqlLiteral + 完成后刷新状态）、重启（确认弹窗 + RESTART WITH start_value）、重命名（复用④弹窗）、drop（确认 + 父节点刷新）。
  - **enum/domain/composite**：查看/复制定义（get*Definition，oid 定位）；**双击类型节点直接弹定义**（补上 Slice 14 留空的行为）。
  - **extension**：安装弹窗（可用扩展列表标注已安装并禁用 + schema 下拉默认 public + CREATE EXTENSION ... SCHEMA）、卸载（确认 + DROP EXTENSION + extensions 分组刷新）、复制信息（name/version/schema）。
  - **运维**：vacuum/analyze/reindex（确认弹窗；REINDEX 带库名 quote）。
  - **巡检**：`treeInspectionSql.ts` 纯函数——roles/sessions/locks/blocking/object-grants 五类查询逐行平移（openGauss/gaussdb 走 NULL wait_event 与自连锁兼容分支；grants 按 schema/对象两形态 + escapeSqlLiteral）；经 onGenerateSql 带 `title` 与 `autoExecuteNonce` 开查询 tab **自动执行**（Slice 11 埋的 autoExecuteNonce 链路首次实战）。
  - **备份/还原入口**：菜单项已加（supportsBackupRestore gating），点击占位提示——对话框随 Slice 25 迁入。
  - 菜单补齐：database 的 PG 管理/巡检两子菜单、schema/表/视图/序列的 inspect-object-grants、sequence/enum/domain/composite/extension 全类型菜单。
  - 验收结果：`npm run build` 通过、vitest 28/28；**待使用者确认（PG）**：sequence 六动作、类型定义查看（含双击）、扩展装卸、vacuum/analyze/reindex、五类巡检查询自动执行出结果、openGauss 兼容分支（如有环境）。

**Slice 16：表数据浏览** ｜规模 M ｜**已完成（2026-07-10）**

- 实际改动：
  - `src-react/components/data/TableDataGrid.tsx + .module.css`（读侧子集）：滚动加载（LIMIT/OFFSET 前端拼 SQL 现状保留 + 触底续页 + 失败回退页码）、where 筛选弹窗（自由输入拼 WHERE——现状保留）、结构缓存与主键提取（ensureTableStructure，目标表变化时重置）、只读 tag、行计数/加载中/已到底提示、导出三格式（带当前筛选条件）、刷新；`quoteIdentifier` 方言引用与 PG 系默认 public schema 的 tableRef 规则照抄。
  - 表格复用 Slice 12 的 ResultGrid（AG Grid：虚拟滚动/列宽拖拽/NULL 灰字/触底检测）；分页守卫（loading/hasMore）留在本组件。
  - HomeView：data 类型 tab 接入真实 TableDataGrid（React.lazy），替换占位。
  - 暂缺（按计划后置，工具栏按钮为占位提示）：inline 新增/表单新增/删除标记/提交预览/丢弃/cell viewer 联动/导入（Slice 17，届时行标记改独立编辑状态层 + checkbox 列 + cell 编辑）；刷新时"有变更先确认"守卫随 Slice 17。
- 验收结果：`npm run build` 通过、vitest 28/28；待使用者验证：树双击/右键"查看数据"开表浏览、滚动到底自动续载（观察行计数增长与"已全部加载"）、筛选条件生效、刷新、导出 CSV/JSON/SQL（含筛选）、只读连接显示金色 tag 且编辑按钮禁用。

**Slice 17：表数据编辑** ｜规模 XL（按子批：cell 编辑→inline 新增→表单新增（InsertRecordDialog）→删除标记→SQL 预览→提交→丢弃→cell viewer 联动）

- 要点：行标记（`_isNew/_isDeletedPending/_originalData/__rowIndex`）改为**独立的编辑状态层**（Map by rowIndex），不再挂行对象上（AG Grid 行数据保持纯净）；提交流程"逐条参数化命令、预览仅展示"的现状**原样保留**（2.5 已知问题 2 不修）；只读三层拦截逐条对照。
- 验收：8.6 节矩阵全过；重点回归：改回原值自动清脏、无主键表拒绝改删、提交中途失败强制刷新。

**进度**：
- **子批 A（编辑基座）✅ 代码完成（2026-07-10）**：
  - `DataEditGrid.tsx`：可编辑 AG Grid——checkbox 多选列（header 全选）、双击 cell 编辑（pending-delete 行禁编）、三态样式（modified 黄角标/new 蓝/pending-delete 红删除线，全局类入 grid.css）、`refreshToken` 驱动 refreshCells、`deselectToken` 清勾选、触底加载、列宽拖拽；行数据纯净（仅 __rowIndex）。
  - TableDataGrid：**独立编辑状态层落地**（计划核心要点）——`pendingEdits`（rowIndex→field→{old,new}）+ `newRowIndexes`/`pendingDeleteIndexes`（Set）为不可变 state（ref 镜像），`originals`/`touchedFields` 纯 ref；`recordChange` 照抄（新行记 touched；旧行与原值比较，**改回原值自动清脏**）。
  - 已迁动作：cell 编辑、inline 新增（buildInitialColumnValue 初始值 + 定位 viewer 到首个可编辑列）、删除标记（新行直接移除；旧行**无主键拒绝**、标记待删并清其 pendingEdits、红色待删计数 tag）、丢弃（恢复旧值 + 移除新行 + viewer 回显）、刷新守卫（有变更先确认）。
  - **cell viewer 双向联动闭环**（4.4 注册表模式首个写入方）：ownerId 注册 6 个动作（onChange 回写 + 记变更/onToggleNull/onFormatJson/onCopyCell/onCopyRowJson/onCopyRowInsert——INSERT 复制走 buildInsertSql）；grid 内编辑同步 viewer、viewer 编辑同步 grid；卸载注销并清面板。
  - 待迁（子批 B）：SQL 预览 + 提交（createPreviewPlan/buildInsertPayload/dataApi 三命令 + 中途失败强制刷新）、表单新增（InsertRecordDialog）、导入对话框（Slice 25）。保存按钮当前为占位提示。
  - 验收结果：`npm run build` 通过、vitest 28/28；**待使用者确认**：双击编辑黄角标、改回原值清脏、inline 新增蓝行、勾选删除红删除线（无主键表拒绝）、丢弃恢复、cell viewer 点击联动与双向编辑、只读全禁。
- **子批 B（预览+提交+表单新增）✅ 代码完成（2026-07-11）——Slice 17 收口**：
  - `createPreviewPlan`/`buildRowInsertPayload` 照抄（touched/nullable/default/auto_increment 判定、必填缺失/空 INSERT 抛错、无主键拒绝改删）；预览弹窗（插入/更新/删除计数 tag + 前端拼串 SQL 展示——已知问题 2"预览与执行不一致"现状保留）。
  - `confirmSubmitChanges`：逐条走 dataApi 参数化命令（insert/update/delete）；update 成功同步原值快照；**中途失败强制刷新**；insert/delete 成功后整表刷新。
  - `InsertRecordDialog.tsx + .module.css`：表单新增（字段类型分派 boolean 下拉/textarea/json/input、默认值预填与 dirty 判定、SET NULL 复选、INVALID_JSON 错误映射）；插入成功后刷新并定位 viewer 到新行。
- **使用者已切换免确认模式（2026-07-11）**：Slice 17B 起连续交付，不再逐片停顿；验收统一在收尾后按第 8 章矩阵进行。

**Slice 18：表设计器** ｜规模 L ｜**已完成（2026-07-11，免确认模式）**

- 实际改动：`TableDesigner.tsx + designerTypes.ts + 三子组件 tsx/css`。子组件 prop 突变 v-model **改受控回调上抛**（onPatch/onRemove/onMove，父组件不可变更新——计划要求落地）；pendingDeletions 队列（ref）、collectChanges 8 种 change 类型、`collectReorderChanges`（MySQL 列重排 identity 追踪算法逐行平移）、`buildPreviewSql` 全方言分支（PG RENAME/TYPE/NOT NULL 三段、MySQL CHANGE/MODIFY、SQLite 不支持注释行）照抄；DDL tab 拆为独立 `DesignerDdlPane`（Tabs 惰性渲染下首次激活挂 Monaco 只读实例）；initialTab/initialAction 定位与 actionKey 去重照抄（add_column/index/fk 自动开编辑）；主键勾选强制非空；预览确认走 alterTableStructure 参数化（已知问题 2 现状保留）。HomeView design tab 接入（Slice 15③ 的定位参数至此闭环）。
- `npm run build` 通过。

### Phase 5 — 周边功能（Slice 19–25）｜里程碑：功能面 100% 对齐

**Slice 19：Redis 工作区** ｜规模 L ｜**已完成（2026-07-11，免确认模式）** —— `utils/redisCommand.ts` 纯函数（tokenize/parse，**8 个单测**——D11 第 4 项收口）；RedisCommandInput（Monaco shell + 107 命令补全 + Ctrl+Enter）；RedisResultPanel（**v-html 改安全文本渲染**，仅字面 \r\n 换行替换）；RedisKeyViewer（string 编辑保存保 TTL/list/set/zset/hash 五视图 + 删除确认，组合 :key 重挂载改 refreshToken 重载）；RedisServerInfo；RedisEditor（30s PING 保活、db0-15 切换与 SELECT 回写、历史 `redis_command_history` 上限 100、连接变化重置）。HomeView redis tab + handleDatabaseSelected Redis 分支（开命令行 tab + 100ms 后 switchDatabase）闭环。`npm run build` 通过。
**Slice 20：设置页** ｜规模 M ｜**已完成（免确认模式）** —— SettingsContent 四分区（12 个可写 computed → 受控 + store setter）、字体列表加载策略照抄、About（get_app_info）。设置仅 tab 宿主（D5）。
**Slice 21：全局搜索** ｜规模 M ｜**已完成（免确认模式）** —— 使用 Slice 2 已收编的 metadataApi；`v-html` 高亮改分段渲染；scope 规则（非 PG 才显示存储过程）照抄。
**Slice 22：查询构建器** ｜规模 M ｜**已完成（免确认模式）** —— 纯前端 SQL 生成逻辑平移；"执行"仍是开新查询 tab 填 SQL（现状语义）。
**Slice 23：数据对比** ｜规模 S–M ｜**已完成（免确认模式）** —— 现状"简化对比"平移，"生成同步脚本=开发中"提示保留。
**Slice 24：ER 图** ｜规模 M ｜**已完成（免确认模式）** —— 自绘 SVG/transform 交互平移。
**Slice 25：剩余数据库对话框** ｜规模 L ｜**已完成（免确认模式）** —— Create Database / Import / Backup / Restore 四个迁移完成并接入 DatabaseTree；导出走 Slice 12/16 的内联实现。**考察修正**：`CreateTableDialog.vue`/`CreateViewDialog.vue`/`ExportTableDialog.vue` 三个文件在 Vue 版全仓 0 引用（含 kebab-case 模板用法），系整组件级死代码（2.5 节死代码清单原只记录了其死字段），不迁移，随 Slice 27 一并删除。

### Phase 6 — 收尾（Slice 26–27）｜里程碑：Vue 依赖清零，仓库归位

**Slice 26：关闭保护 + 剪贴板路由** ｜规模 M

- `useWorkspaceCloseGuards`：onCloseRequested 拦截 → 逐个激活脏 tab → 三按钮确认（取消/放弃/保存，antd React Modal 受控实现）→ 全过后 destroy；`closeTabWithConfirm` 单/批复用。`useWorkspaceClipboardRouting`：window 捕获阶段 4 事件 + Monaco 判定 + 选区判定逻辑照抄。
- 为什么放最后：依赖"所有产生脏状态的功能"就绪后才能完整验收。
- **✅ 已完成（2026-07-12，免确认模式）**：两个 hook 接入 HomeView——tab 右键菜单五种关闭动作与 Tabs onEdit 全部改走 `closeTabWithConfirm/closeTabsWithConfirm`（批量 keys 计算照抄 useWorkspaceTabMenuActions）；窗口关闭拦截与剪贴板路由随 hook 挂载生效。**顺带接线**：AppHeader 的打开 SQL 文件/保存/另存与 SqlEditor 的 onRequestSave/onRequestSaveAs 从占位提示切到已实现的 handleOpenSqlFile/saveQueryTab(As)。`npm run build` 通过、vitest 36/36。
- 验收：8.3 节关闭保护全场景 + Monaco 内外复制粘贴行为对照 Vue 版（统一在收尾后按第 8 章矩阵进行）。

**Slice 27：清理与归位** ｜规模 M ｜**已完成（2026-07-12）**

- 实际改动：
  - 删除：全部 40 个 `.vue`、`composables/`、4 个 Pinia store、`i18n.ts`、`main.ts`/`App.vue`、`router/`、`plugins/vxe.ts`、`components/vxe/VxeGridRuntime.ts`、`utils/vxeTheme.ts`、`services/export.ts`（死代码）、`types/internal.ts`（仅 Vue composables 消费）、`style.css`（已被 React 的 `styles/global.css` 取代）、Vue 版 `panelRegistry.ts`/`ui/antd.ts`（同路径被 React 版覆盖）、`react.html` 双入口、`tauri.react.conf.json`、`tsconfig.react.json`、`auto-imports.d.ts`/`components.d.ts`、`dist-solid/` 残留、Vue 版全组件死代码 CreateTableDialog/CreateViewDialog/ExportTableDialog。
  - 归位：`src-react/*` 全量 `git mv` 进 `src/`（目录一一对应，组件内部全用相对导入与 `@/`，实测 `@react/` 别名 0 使用，零改动归位）。
  - 配置：`index.html` → `/src/main.tsx`；`vite.config.ts` 纯 React（删 vue/unplugin 插件链、双入口、vue 系 manualChunks；ant-design chunk 改匹配 antd React）；`tsconfig.json` 合并 react 配置（jsx react-jsx、include src）；vitest 配置去 `@react`；`package.json` build = `tsc --noEmit && vite build`，卸载 9.3 表左列全部 Vue 依赖。
  - 文档：CLAUDE.md（技术栈/状态管理/hooks/Monaco worker/命令数 74/代码分割）、README（技术栈/项目结构）、AGENTS.md 同步为 React 事实。
- 验收结果：`npm run build`（tsc + vite，7.4s）通过；vitest 36/36；`grep -rE "from '(vue|pinia|vxe|ant-design-vue)"` 0 命中（仅注释中的历史说明）；`npm run tauri:build` 见第 10 章状态表。

---

## 7. 风险清单与应对

| # | 风险 | 等级 | 应对 |
|---|---|---|---|
| R1 | antd React 与 antdv DOM 结构差异导致深层样式覆盖失效（`:deep` 共 30+ 处，集中在 Tabs 高度链/Modal.confirm/表格 cell） | 高 | D10 策略 + 每片验收含与 Vue 版同屏视觉对照；Tabs 全部改 items API 时集中核对 |
| R2 | AG Grid 主题与现有 token 融合度不足 | 中 | Slice 12 设为决策复核点，备选 TanStack 影响面已隔离在 2 个网格组件 |
| R3 | DatabaseTree 体量（2843 行）迁移期行为丢失 | 高 | 拆 2 片 + 5 子批，右键菜单按调研清单逐项打勾；key 编码规则严禁"顺手重构" |
| R4 | in-place 突变思维残留导致 React 版状态不更新（最隐蔽的 bug 形态） | 高 | `updateTab` 单一原语 + code review 关键词清单（赋值给 `tab.`、`row._` 一律拒绝） |
| R5 | 关闭保护异步流程（激活→确认→保存→destroy）时序错乱丢用户数据 | 高 | 独立切片 + 8.3 全场景手测；destroy 前日志确认 save 完成 |
| R6 | Monaco worker 修复引发新问题（如 CSP） | 低 | ?worker 是 Vite 官方路径；失败回退方案：保持主线程现状（也不比今天差） |
| R7 | i18next 插值配置遗漏导致文案出现 `{name}` 字面量 | 低 | Slice 3 验收专测带插值 key；全局 grep `{` 的 key 清单抽查 |
| R8 | 双入口期间 Vue/React 同时可写 localStorage 造成设置互踩 | 低 | key 与格式完全一致（红线 1），互踩即互通——这是特性不是 bug；仅需注意两版不要同时开 |
| R9 | 每 tab 后端会话 id 规则走样导致取消查询打错目标 | 中 | 规则写入红线 3；Slice 11 验收含"双 tab 各执行长查询、分别取消"用例 |
| R10 | 估算偏差（XL 片实际更大） | 中 | XL 片都已带子批切分，子批粒度可独立确认与暂停 |

---

## 8. 手动验证矩阵（切片验收引用此处）

### 8.1 通用
启动无白屏（splash 正常）；light/dark/system 切换并重启保持；中英切换；窗口三键与拖拽；侧栏折叠/拖宽保持。

### 8.2 连接
列出既有连接；新建 MySQL/PostgreSQL/SQLite/Redis 各一；编辑（不改密码）后仍可连；删除有确认；测试连接成功/失败两态；连接/断开徽章正确；连接失败错误可读；SQLite 选择/新建文件；只读开关生效。

### 8.3 工作区与关闭保护
新建/切换/关闭各类 tab；关闭规则（当前/左/右/其他/已保存）；dirty 圆点；关闭脏 tab 三按钮各走一遍；窗口关闭拦截：取消/放弃/保存三路径；重启会话恢复（含文件 tab 重读、自动重连）。

### 8.4 SQL
SELECT/UPDATE/DDL/错误 SQL/多语句进度/长查询取消（含双 tab 各自取消）；危险 SQL 五类确认；只读拦截写语句；格式化；EXPLAIN；历史记录与搜索；片段插入；文件打开/保存/另存（Ctrl+S）；补全（表/列/别名/函数 snippet/PG GUC）；语句高亮随光标。

### 8.5 数据库树
MySQL/PG/SQLite 三树展开；搜索（普通/正则/大小写/列名）计数与高亮；15 大类右键菜单按子批清单打勾；批量 drop 多选；刷新节点后子树重载。

### 8.6 表数据
浏览/滚动加载/筛选；cell 编辑（含改回原值清脏）；inline 新增与表单新增；删除标记与撤销；SQL 预览计数正确；提交后数据正确且脏态清空；无主键表拒绝改删；只读全链路禁用；导入 CSV/JSON/SQL；导出三格式；cell viewer 双向联动。

### 8.7 表设计器
四 tab 加载；加/改/删/移列；加删索引/外键；预览 ALTER 与保存后重载；只读隐藏操作；initialAction 定位（从树的 add column 等入口进入）。

### 8.8 Redis
PING/GET/SET；补全；db0-15 切换；key 查看 5 类型；string 编辑保存（TTL 保留）；删除 key；历史；INFO 弹窗；30s 保活断线提示。

### 8.9 工具页
QueryBuilder 生成/复制/送编辑器；DataCompare 两类对比与结果展示；ER 图打开/拖节点/缩放/适应视图；全局搜索各 scope 与结果动作。

---

## 9. 最终结果（迁移完成后是什么样子）

### 9.1 用户视角：行为不变清单

- 界面布局、配色、图标、交互与迁移前一致（同一套 token 与 CSS 变量渲染）。
- 所有连接配置、密码、工作区会话、SQL 历史、片段、保存的查询、主题/语言/字体设置**原样继续可用**——因为存储介质与格式一个字没改。
- 74 个后端能力（查询/元数据/导出/Redis/会话）行为一致——因为后端零改动、调用合约零改动。
- 可感知的差异只有一条（且是正向的）：大 SQL 文件编辑不再卡顿（Monaco worker 修复的自然结果）。

### 9.2 代码库终态

```text
src/
  api/            # 原样（8 模块，74 命令）
  components/     # 全部 .tsx + .module.css，目录结构与今天一一对应
    connection/ data/ database/ editor/ grid/ layout/ right-panel/ search/ settings/ tools/
  hooks/          # 原 composables 的 React 版（useTabManager, useSqlExecution, ...）
  i18n/           # i18next 初始化
  locales/        # 原样两份 JSON
  services/       # sqlAutocomplete / redisAutocomplete 原样
  stores/         # 4 个 Zustand store（app / connection / workspace / rightPanel）
  theme/          # tokens.ts 原样 + useThemeVariables
  types/          # 原样 + settings.ts（Slice 2 抽出）
  ui/antd.ts      # 桥接改指 antd React
  utils/          # 原样（errorHandler/autoReconnect 已解耦形态）
  App.tsx  main.tsx  style.css
src-tauri/        # 零改动
```

不再存在：`.vue`、`composables/`、`router/`、`plugins/vxe.ts`、`auto-imports.d.ts`、`components.d.ts`、`react.html` 双入口、`src-react/`（已归位）、`dist-solid/`。

### 9.3 依赖对照表

| 移除（Vue 侧） | 引入（React 侧） | 说明 |
|---|---|---|
| vue | react、react-dom | React 19 |
| pinia | zustand | 4 store 同名迁移 |
| vue-router | —（无对应） | D5：桌面单工作台无路由需求 |
| vue-i18n | i18next、react-i18next | 翻译 JSON 零改动 |
| ant-design-vue | antd、@ant-design/v5-patch-for-react-19 | 同设计体系 |
| @ant-design/icons-vue | @ant-design/icons | 同名图标 |
| @iconify/vue | @iconify/react | 图标名不变 |
| vxe-table、vxe-pc-ui、xe-utils | ag-grid-community、ag-grid-react | D7；实际特性面已核实覆盖 |
| vue-virtual-scroller | —（无对应） | 本来就是死依赖 |
| @vitejs/plugin-vue | @vitejs/plugin-react | — |
| vue-tsc | —（用 tsc） | build 脚本简化 |
| unplugin-auto-import、unplugin-vue-components | —（显式 import） | React 生态惯例 |
| vite-plugin-monaco-editor（未启用） | —（Vite ?worker） | 顺带修复 |
| —（新增 devDep） | vitest | 仅 4 组纯函数单测 |

保留不动：@tauri-apps/*（5 个包）、monaco-editor、vite、typescript。

### 9.4 开发工作流变化

- `npm run build` = `tsc --noEmit && vite build`（不再需要 vue-tsc；TSX 模板获得完整类型检查）。
- 组件/图标显式 import（不再有自动导入的隐式全局）。
- 命令式调用从字符串反射（`callActiveEditor('foo')`）变为类型化 handle——重命名方法时编译器兜底。
- 新增 `npx vitest` 跑纯函数单测。
- CLAUDE.md/AGENTS.md/README 技术栈描述已同步更新。

### 9.5 顺带修复清单（迁移中一并完成的纯技术项——均不改变用户可见行为）

1. Monaco worker 构建脱节 → Vite ?worker（唯一"可感知"收益：大文件不卡）。
2. GlobalSearch 两处裸 invoke → 收编 metadataApi（Slice 2）。
3. useWindowControls 的 onResized 监听泄漏 → cleanup（Slice 5）。
4. 死依赖/死代码清除（vue-virtual-scroller、vite-plugin-monaco-editor、services/export.ts、死 emit、SettingsView 死路由宿主）。
5. 双 Monaco 封装、双对话框 v-model 命名（modelValue vs visible）→ 各统一为一种。
6. `callActiveEditor` 字符串反射 → 类型化 handle。

**明确不修**（保持原行为，迁移后另立任务）：2.5 节"已知业务问题"1–6（SQL 拼接注入面、预览与执行不一致、无排序、DataCompare 简化对比、GlobalSearch N+1、hasColumnDefault 双实现）。

**迁移后任务（使用者已确认，2026-07-11）**：UI/UX 整体重设计——使用者认为现有界面不够专业美观，决定待 Slice 27 收尾（Vue 依赖清零）后立独立阶段执行；届时安装社区 skill「UI/UX Pro Max」与「Impeccable」（当前环境未安装），基于现有 token 体系出完整设计方案。迁移期间维持"视觉不变"红线，保证 Vue 同屏对照基准有效。

### 9.6 完成定义（DoD）

1. 第 8 章矩阵在 MySQL + PostgreSQL + SQLite + Redis 四引擎全量通过。
2. `npm run build`、`npm run tauri:dev`、`npm run tauri:build` 三关通过。
3. `package.json` 无任何 Vue 生态依赖；`src/` 无 `.vue` 文件。
4. 用既有用户数据目录（真实 connections.json/session.json/localStorage）冷启动，一切延续。
5. 文档（CLAUDE.md/AGENTS.md/README）与实际一致。

---

## 10. 当前状态与下一步

| 项 | 状态 |
|---|---|
| 迁移分支 | `migration/vue-to-react`（与 main 同基点，尚无迁移提交） |
| 本文档 | v2，2026-07-09 基于全量代码考察重写 |
| Slice 0 基线 | ✅ 通过（2026-07-09）：`npm run build` 10.2s 构建成功；`CARGO_TARGET_DIR=src-tauri/target-196 cargo check --locked` 通过。旧版文档记录的 PowerShell/沙箱构建障碍在当前环境未复现 |
| Slice 1 React 壳 | ✅ 完成。后续修复了 `tauri.react.conf.json` 的 build 段合并问题（原最小化写法导致 beforeDevCommand 丢失、React 窗口纯白），已实测 `tauri:dev:react` 端到端可用 |
| Slice 2 共享层解耦 | ✅ 完成（Vue 版经使用者日常运行验证正常） |
| Slice 3 i18n | ✅ 完成并经使用者确认 |
| Slice 4 appStore + 主题 | ✅ 完成并经使用者确认 |
| Slice 5 窗口控制 + 布局壳 | ✅ 完成并经使用者确认 |
| Slice 6 connectionStore | ✅ 完成并经使用者确认 |
| Slice 7 连接面板 + 对话框 | ✅ 完成并经使用者确认 |
| Slice 8 Workspace tabs | ✅ 完成（使用者指示继续，进入 Slice 9；如发现问题可随 Slice 9 一并反馈） |
| Slice 9 Workspace 会话 | ✅ 代码完成（2026-07-10）：`npm run build` 通过、vitest 10/10；**待使用者确认**：重启会话恢复/文件 tab 重读/自动重连/恢复期无保存风暴 |
| Slice 10 Monaco 基础 | ✅ 完成并经使用者确认（2026-07-10） |
| Slice 11 SQL 执行链路 | ✅ 完成并经使用者确认（2026-07-10） |
| Slice 12 高性能结果表 | ✅ 完成并经使用者确认（2026-07-10） |
| Slice 13 右侧面板 | ✅ 完成并经使用者确认（2026-07-10） |
| Slice 14 数据库树基础浏览 | ✅ 完成并经使用者确认（2026-07-10） |
| Slice 15 树右键菜单 | ✅ 五个子批全部完成并经使用者确认（2026-07-10） |
| Slice 16 表数据浏览 | ✅ 完成并经使用者确认（2026-07-10） |
| Slice 17 表数据编辑 | ✅ 子批 A/B 全部完成（2026-07-11，免确认模式） |
| Slice 18 表设计器 | ✅ 完成（2026-07-11，免确认模式） |
| Slice 19 Redis 工作区 | ✅ 完成（2026-07-11，免确认模式） |
| Slice 20–25 周边功能 | ✅ 完成（免确认模式）：设置页/全局搜索/查询构建器/数据对比/ER 图/剩余对话框（4 个活对话框迁毕；CreateTable/CreateView/ExportTable 三对话框实测为 Vue 版整组件死代码，不迁） |
| Slice 26 关闭保护 + 剪贴板路由 | ✅ 完成（2026-07-12）：两 hook 接入 HomeView；顺带接通文件打开/保存/另存实际实现。build + vitest 36/36 通过 |
| Slice 27 清理与归位 | ✅ 完成（2026-07-12）：Vue 代码与依赖清零、src-react 归位 src、配置与文档同步；`npm run build` + vitest 36/36 通过；`npm run tauri:build` 与 `npm run tauri:dev` 冒烟、第 8 章全矩阵终验待使用者执行 |
| 已确认切片 | Slice 17B 起为免确认连续交付；最终验收统一按第 8 章矩阵进行 |

> 执行约定：每完成一个切片（XL 片按子批），更新本表并停下等待使用者确认；确认通过才开始下一片。
