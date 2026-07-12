# Kudu UI 重设计 · 设计文档

> 2026-07-12，基于 brainstorming 会话与可视化伴侣确认的决策撰写。
> 前提：Vue → React 迁移已完成（Slice 0–27），"视觉不变"红线解除。

## 1. 背景与目标

- 现状问题：① 全套 antd 出厂值（蓝 `#1677ff`、默认灰阶/圆角/阴影），观感是"后台模板"而非精心打磨的桌面工具；② 品牌断裂——splash 的 Kudu 暖橙 `#e8a87c` 未进入应用；③ 缺少桌面数据工具的密度与层次细节。
- 目标：以现有 90 个 CSS 变量 token 体系为载体，整体翻新为**专业 IDE 风**外观，并完成三项局部布局重组；亮暗两套主题同等优先。
- 不改变任何功能行为、invoke 合约、持久化格式。

## 2. 已确认决策（决策记录）

| 决策点 | 结论 | 备选与理由 |
|---|---|---|
| 审美方向 | **专业 IDE 风**（DataGrip / VS Code） | 否决：现代 SaaS 精致风、原生桌面风、antd 微调 |
| 强调色 | **克制工具蓝 `#3574f0`**（亮暗同值） | 否决：品牌暖橙作交互色、双色方案；橙降级为点缀（见 §5.4） |
| 范围 | **视觉全面翻新 + 三项布局重组** | 重组项：活动图标栏、状态栏信息重组、SQL 工具栏图标化分组；否决：连接面板头部工具条（不做） |
| 主题优先级 | **亮暗同等优先**，逐 token 成对设计 | — |
| 色彩路线 | **方案 A：自建色板**，灰阶结构采纳 **B：纯中性灰**（VS Code Dark Modern 系——边栏比编辑器更暗，零色偏） | 否决：JetBrains 冷灰蓝调、逐值移植 VS Code |
| 密度 | **适中档（TablePlus 档）**：树行 26px、网格行 32px、基准字号 13px | 否决：紧凑档（树 24 / 网格 28 / 12px） |

## 3. 设计原则

1. **边框分层，不靠阴影**：面板之间用 1px 边框 + 灰阶差分层；阴影只用于浮层（弹窗/下拉/右键菜单）。
2. **层次方向**：暗色下边栏/工具条/状态栏用最深灰，编辑器与内容"浮"在其上；亮色下方向对应（边栏灰、内容纯白）。
3. **色彩克制**：交互色只有工具蓝一种；语义色（成功/危险/警告）只出现在状态与危险动作上；品牌橙仅三处点缀。
4. **密度即专业感**：适中档统一收紧，全部密度值 token 化，未来可全局调档。
5. **亮暗成对**：每个 token 亮暗两值同时定稿，同一结构逻辑推导，不允许"暗色精修、亮色凑合"。

## 4. 色彩体系（token 全表）

载体：`src/theme/tokens.ts` 的 `AppThemeTokens` 两套值全部重绘。字段名不变（消费方零改动），新增字段见 §6。

### 4.1 灰阶与文字

| token | Dark | Light | 用途 |
|---|---|---|---|
| appBg | `#181818` | `#f8f8f8` | 应用最底 |
| appText | `#cccccc` | `rgba(0,0,0,0.85)` | 主文字 |
| appTextMuted | `#a8a8a8` | `rgba(0,0,0,0.65)` | 次级文字 |
| appTextSubtle | `#868686` | `rgba(0,0,0,0.45)` | 辅助/占位 |
| surface | `#1f1f1f` | `#ffffff` | 编辑器/内容区 |
| surfaceElevated | `#242424` | `#ffffff` | 浮起面板 |
| surfaceMuted | `#181818` | `#f3f3f3` | 沉底面板 |
| surfaceHover | `rgba(255,255,255,0.065)` | `rgba(0,0,0,0.045)` | 行悬浮 |
| surfaceActive | `rgba(53,116,240,0.28)` | `rgba(53,116,240,0.12)` | 行选中 |
| surfaceOverlay | `#242424` | `#ffffff` | 弹层背景 |
| border | `#2b2b2b` | `#e5e5e5` | 常规边框 |
| borderStrong | `#3c3c3c` | `#d4d4d4` | 控件边框 |
| borderMuted | `#262626` | `#efefef` | 弱分隔线 |

### 4.2 强调与语义

| token | Dark | Light |
|---|---|---|
| primary | `#3574f0` | `#3574f0` |
| primaryHoverBg | `rgba(53,116,240,0.14)` | `rgba(53,116,240,0.08)` |
| primaryActiveBg | `rgba(53,116,240,0.22)` | `rgba(53,116,240,0.14)` |
| primarySoftBg | `rgba(53,116,240,0.08)` | `rgba(53,116,240,0.05)` |
| primaryBorder | `rgba(53,116,240,0.45)` | `rgba(53,116,240,0.35)` |
| danger / dangerHover | `#f14c4c` / `#ff6b6b` | `#e5484d` / `#f0666a` |
| dangerSoftBg / dangerBorder | `rgba(241,76,76,0.10)` / `rgba(241,76,76,0.28)` | `rgba(229,72,77,0.07)` / `rgba(229,72,77,0.25)` |
| warning / warningSoftBg / warningText | `#e0af3f` / `rgba(224,175,63,0.14)` / `#e8c268` | `#d19000` / `rgba(209,144,0,0.12)` / `#7a5b00` |
| success / successSoftBg / successText | `#4cc38a` / `rgba(76,195,138,0.14)` / `#4cc38a` | `#2da44e` / `rgba(45,164,78,0.10)` / `#1f7a3c` |
| focusRingPrimary | `0 0 0 2px rgba(53,116,240,0.45)` | `0 0 0 2px rgba(53,116,240,0.30)` |
| colorOnDanger | `#ffffff` | `#ffffff` |
| windowCloseHoverBg | `#c42b1c`（保持） | `#e81123`（保持） |

### 4.3 区域背景

| token | Dark | Light |
|---|---|---|
| headerBg / headerBorder | `#181818` / `#2b2b2b` | `#f3f3f3` / `#e5e5e5` |
| sidebarBg | `#181818` | `#f3f3f3` |
| tabBarBg / tabActiveBg | `#181818` / `#1f1f1f` | `#f3f3f3` / `#ffffff` |
| toolbarBg | `#181818` | `#f3f3f3` |
| overlayBg / overlayBorder | `#242424` / `#3c3c3c` | `#ffffff` / `#d4d4d4` |
| scrollbarThumb / hover | `#3c3c3c` / `#4a4a4a` | `#cfcfcf` / `#b8b8b8` |
| shadowOverlay | `0 8px 24px rgba(0,0,0,0.5)` | `0 6px 20px rgba(0,0,0,0.14)` |
| shadowSoft | `0 1px 3px rgba(0,0,0,0.4)` | `0 1px 2px rgba(0,0,0,0.06)` |
| swatchRing / indicatorRingSoft | 保持现值 | 保持现值 |
| radiusSm / radiusMd | **`4px` / `6px`**（原 6/10） | 同 Dark |

### 4.4 连接色与图标色（降饱和）

- connectionColor1–8 · Dark：`#e06c6c` `#e08a5c` `#d9b13f` `#7bc86c` `#4fc3b5` `#5c9ce6` `#a586e0` `#d977ac`；Light：保持现有 tailwind 系 8 色不变（亮色下饱和度合适）。
- iconColor* · Dark：blue `#6ca6e8`、orange `#d99a66`、yellow `#d4b45c`、green `#7bc86c`、teal `#56b8b0`、purple `#a586e0`、pink `#d977ac`、slate `#8a949e`、emerald `#6cbf7c`、brown `#b59276`、cyan `#58b7c9`、gray `#9a9a9a`、muted `#6e6e6e`。
- iconColor* · Light：blue `#3b7dd8`、orange `#d97a2e`、yellow `#c9971a`、green `#3f9e3f`、teal `#159e93`、purple `#7a52c7`、pink `#d24a8e`、slate `#607d8b`、emerald `#2e9e50`、brown `#8d6e5c`、cyan `#1195ac`、gray `#8c8c8c`、muted `#bfbfbf`。

### 4.5 品牌橙（新增 token）

| token | Dark | Light | 用途 |
|---|---|---|---|
| brandAccent | `#e8a87c` | `#b4713d` | Kudu 标识、活动栏 logo |
| brandAccentSoftBg | `rgba(232,168,124,0.15)` | `rgba(232,168,124,0.18)` | 只读徽章底 |

**使用边界**：只读徽章、splash（已有）、活动栏 Kudu 标识三处，不参与任何交互控件配色。

## 5. 密度与字体（新增密度 token）

| token | 值 | 说明 |
|---|---|---|
| fontSizeBase / fontSizeSm | `13px` / `12px` | 基准与辅助字号 |
| rowHeightTree | `26px` | 树行（原 28） |
| rowHeightGrid / gridHeaderHeight | `32px` / `32px` | AG Grid 行/表头（原 36/36） |
| toolbarHeight | `32px` | SQL 工具栏等 |
| tabBarHeight | `32px` | 工作区 tab 条 |
| statusBarHeight | `24px` | 状态栏 |
| activityBarWidth | `40px` | 新活动栏 |
| headerHeight | `32px` | 标题栏，**不变**（拖拽区合约） |

字体族不变（界面 Inter/Segoe UI 栈、编辑器 JetBrains Mono 栈，仍由用户设置覆盖）。

## 6. 布局重组三项（规格）

### 6.1 活动图标栏（新组件 `ActivityBar.tsx`）

- 位置：最左侧固定 40px 竖条，背景 sidebarBg，右侧 1px 边框。
- 条目：顶部「数据库树」「全局搜索」；底部「设置」。激活项左缘 2px 蓝色指示条，图标白色；非激活灰 `appTextSubtle`，hover 提亮。
- 行为：数据库树按钮——侧栏展开且当前即数据库视图时点击 = 收起侧栏；收起时点击 = 展开（复用现有 `sidebar_collapsed` 存储 key 与 appStore setter，合约不变）。全局搜索 = 打开现有 GlobalSearch 弹窗。设置 = 打开现有 settings tab。
- 顶部放 Kudu 标识（brandAccent 单色小图标）。原头部菜单/状态栏的对应入口全部保留不删。

### 6.2 状态栏信息重组（`AppStatusBar.tsx` 原地重构）

- 左段（连接上下文）：连接状态 pill（绿 = 已连 / 灰 = 断开 / 红 = 错误，含连接名）→ 库名 → schema → 只读徽章（brandAccent pill，仅只读时显示）。
- 右段（执行反馈 + 控制）：执行中 spinner + 耗时 / 完成后行数 + 耗时 → 右侧面板开关（最右）。中段留白。
- props 集合不变（六项 + 面板开关），只重排视觉与图标化；高度 24px。

### 6.3 SQL 工具栏图标化分组（`SqlToolbar.tsx` 原地重构）

- 高度 32px，icon button（24×24，tooltip 必配）+ 1px 分隔线分组：
  - 执行组：运行（F5）/ 停止 / EXPLAIN；
  - 文档组：格式化 / 保存（Ctrl+S）；
  - 辅助组：历史 / 片段；
  - 溢出「⋯」菜单：另存为、清空、刷新自动补全（及未来次要动作）。
- 右端上下文区：数据库下拉 → search_path 编辑（PG 系）→ 结果面板开关。
- 全部动作与现有回调一一对应，无增删；只读/执行中的禁用逻辑原样保留。

## 7. 组件细节打磨清单

1. **标题栏**：背景 headerBg（与边栏同色），菜单文字 appTextMuted；窗口三键与拖拽区规则不变。
2. **数据库树**：行高 26px；iconify 图标色统一走降饱和 iconColor*；徽章右对齐 11px appTextSubtle；连接行 3px 左缘连接色条保留；引导线用 borderMuted。
3. **工作区 Tabs**：激活 tab 顶部 2px primary 强调条、背景 tabActiveBg 与编辑器连成一体；关闭按钮 hover 显现；dirty 圆点 primary 色。
4. **AG Grid**：`agGridTheme.ts` 继续绑 CSS 变量自动跟随；行/表头 32px；无斑马纹；选中行 surfaceActive；NULL 灰斜体保留；表头背景 surfaceMuted。
5. **Monaco**：新增 `kudu-dark` / `kudu-light` 自定义主题——背景 surface、当前行 `#242424`/`#f5f5f5`、选区 `rgba(53,116,240,.30)`/`.18`、语句高亮 decoration 从 primarySoftBg 推导；随主题切换 setTheme。
6. **弹窗/下拉/右键菜单**：radiusMd 6px、shadowOverlay 分层；`Modal.confirm` 系（危险操作 ~15 处）逐个视觉核对。
7. **antd ConfigProvider**（`App.tsx`）：colorPrimary `#3574f0`、borderRadius 4、fontSize 13、controlHeight 28，dark/light algorithm 下的 token 覆盖表与 tokens.ts 同步。
8. **右侧面板 / 设置页 / Redis 工作区**：仅随 token 与密度联动，无单独重设计。

## 8. 实现架构

- **改动收敛在四层**：`tokens.ts`（值重绘 + 新增字段）→ `useThemeVariables.ts`（新增映射）→ `App.tsx` ConfigProvider → 各组件 `.module.css` 与 `global.css`。
- **新组件仅 `ActivityBar.tsx`**；`AppStatusBar` / `SqlToolbar` 原地重构；`HomeView` 布局列增加活动栏。
- **红线**：不动 invoke 合约、localStorage key 与格式、session 结构、交互流程与快捷键；布局重组只是入口换位置，功能一一对应；`headerHeight` 32px 与拖拽区不变。
- **分批交付与验收**（每批独立可验、独立 commit）：
  - **批 A · token 重绘**：tokens.ts + ConfigProvider + global.css，亮暗两套全局巡检（视觉即变，布局未动）。
  - **批 B · 密度收紧**：密度 token 落地到树/网格/tab/工具栏/状态栏。
  - **批 C · 布局重组**：活动栏 → 状态栏 → SQL 工具栏（三个子批）。
  - **批 D · 细节打磨**：Monaco 主题、Modal 系核对、树图标降饱和、遗漏清理。
- 每批验收 = `npm run build` + 亮暗两主题下过一遍迁移计划第 8 章矩阵的相关页面。

## 9. 非目标

- 不改交互流程、不新增功能面板（活动栏条目即现有入口的换位）。
- 不做动效体系（保留现有 error 脉冲等既有动画）。
- 不引入新 UI 依赖（antd + CSS Modules + CSS 变量足够）。
- 连接色 8 色板语义不变（用户已选颜色继续有效）。

## 10. 实施完成记录

**完成日期：** 2026-07-12 — 全部 8 个实现任务合入 `migration/vue-to-react`。

| 批次 | 任务 | Commit |
|---|---|---|
| A | T1 token 全量重绘（中性灰 IDE 调色板 + 工具蓝） | `731b01d` |
| B | T2 antd 密度收紧 + 密度 CSS token | `a739e4c` |
| B | T3 32px 网格密度 + 静音表头 | `fa5044c` |
| C | T4 VSCode 风格活动图标栏 | `019a476` |
| C | T5 状态栏重组（上下文段 + 反馈段） | `9433a0e` |
| C | T6 SQL 工具栏重排（溢出菜单 + 图标态） | `56b83b4` |
| D | T7 Kudu Monaco 主题（kudu-dark / kudu-light） | `0dbceff` |
| D | T8 细节打磨（tab 强调条 + dirty 圆点）与遗留色清扫 | `9d9b1e5` |

**T8 收口结论：**
- `grep -rn "1677ff\|177ddc" src/` = 0 命中（出厂蓝已清）。
- 树图标 `getIconConfig` 全部走 `var(--icon-color-*)`，无硬编码色值。
- `npm run build` 通过；`npx vitest run` 36/36 全绿。
- 遗留待办（超出色值清扫范围，记录供后续）：DatabaseOutputPanel severity pill 三元色板（缺 `--color-info`/`-notice` 及 warning/success 的 `-border` token，深色下浅底待改造）、ErDiagram PK/FK 语义色、`global.css` `--app-bg` 的 `#1a1a2e` FOUC 回退、`TreeNodeItem` 引用未定义的 `--icon-color-sky`。
