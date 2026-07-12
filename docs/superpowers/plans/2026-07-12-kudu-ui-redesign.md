# Kudu UI 重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按设计文档 `docs/superpowers/specs/2026-07-12-kudu-ui-redesign-design.md` 将 Kudu 翻新为专业 IDE 风（中性灰 + 工具蓝 `#3574f0`），完成活动栏/状态栏/SQL 工具栏三项布局重组。

**Architecture:** 全部改动收敛在四层——`theme/tokens.ts` 值重绘、`useThemeVariables`/`App.tsx` 映射、`global.css` 密度变量、各组件 `.module.css` 与三个组件重构（新增 `ActivityBar.tsx`，重构 `AppStatusBar`/`SqlToolbar`）。

**Tech Stack:** React 19 + antd 5 + CSS Modules + CSS 变量；AG Grid 主题参数已绑 CSS 变量自动跟随；Monaco 自定义主题。

## Global Constraints

- 强调色亮暗同值：`#3574f0`；品牌橙仅 brandAccent 三处点缀（只读徽章/splash/活动栏标识）。
- 不动 invoke 合约、localStorage key 与格式（`sidebar_collapsed` 复用）、session 结构、快捷键、拖拽区（`--header-height: 32px` 不变）。
- 每个任务结束必须过 `npm run build`（tsc + vite）；无 UI 单测体系，验证 = build 门禁 + `npm run tauri:dev` 亮暗两主题目检。
- 组件功能一一对应，无增删（工具栏无"运行选中"，动作集合 = 现有 `SqlToolbarAction` 联合类型）。
- 提交信息用 `feat(ui): ...` 前缀，每任务一个 commit。

---

### Task 1: token 全量重绘（批 A 核心）

**Files:**
- Modify: `src/theme/tokens.ts`（全文件替换两套值 + interface 增两字段）
- Modify: `src/hooks/useThemeVariables.ts:76-79`（CSS_VAR_MAP 追加两行）

**Interfaces:**
- Produces: `AppThemeTokens` 新增字段 `brandAccent: string`、`brandAccentSoftBg: string`；CSS 变量 `--brand-accent`、`--brand-accent-soft-bg`（Task 5 只读徽章、Task 4 活动栏标识消费）。

- [ ] **Step 1: 重写 `src/theme/tokens.ts`**

在 `AppThemeTokens` interface 的 `indicatorRingSoft` 字段后追加：

```ts
  brandAccent: string
  brandAccentSoftBg: string
```

`darkThemeTokens` 整体替换为（字段顺序与 interface 一致）：

```ts
export const darkThemeTokens: AppThemeTokens = {
  appBg: '#181818',
  appText: '#cccccc',
  appTextMuted: '#a8a8a8',
  appTextSubtle: '#868686',
  surface: '#1f1f1f',
  surfaceElevated: '#242424',
  surfaceMuted: '#181818',
  surfaceHover: 'rgba(255, 255, 255, 0.065)',
  surfaceActive: 'rgba(53, 116, 240, 0.28)',
  surfaceOverlay: '#242424',
  border: '#2b2b2b',
  borderStrong: '#3c3c3c',
  borderMuted: '#262626',
  primary: '#3574f0',
  primaryHoverBg: 'rgba(53, 116, 240, 0.14)',
  primaryActiveBg: 'rgba(53, 116, 240, 0.22)',
  primarySoftBg: 'rgba(53, 116, 240, 0.08)',
  primaryBorder: 'rgba(53, 116, 240, 0.45)',
  danger: '#f14c4c',
  dangerHover: '#ff6b6b',
  dangerSoftBg: 'rgba(241, 76, 76, 0.10)',
  dangerBorder: 'rgba(241, 76, 76, 0.28)',
  warning: '#e0af3f',
  warningSoftBg: 'rgba(224, 175, 63, 0.14)',
  warningText: '#e8c268',
  success: '#4cc38a',
  successSoftBg: 'rgba(76, 195, 138, 0.14)',
  successText: '#4cc38a',
  headerBg: '#181818',
  headerBorder: '#2b2b2b',
  sidebarBg: '#181818',
  tabBarBg: '#181818',
  tabActiveBg: '#1f1f1f',
  toolbarBg: '#181818',
  overlayBg: '#242424',
  overlayBorder: '#3c3c3c',
  scrollbarThumb: '#3c3c3c',
  scrollbarThumbHover: '#4a4a4a',
  shadowOverlay: '0 8px 24px rgba(0, 0, 0, 0.5)',
  shadowSoft: '0 1px 3px rgba(0, 0, 0, 0.4)',
  swatchRing: '0 0 0 1px rgba(255, 255, 255, 0.16)',
  focusRingPrimary: '0 0 0 2px rgba(53, 116, 240, 0.45)',
  windowCloseHoverBg: '#c42b1c',
  colorOnDanger: '#ffffff',
  connectionColor1: '#e06c6c',
  connectionColor2: '#e08a5c',
  connectionColor3: '#d9b13f',
  connectionColor4: '#7bc86c',
  connectionColor5: '#4fc3b5',
  connectionColor6: '#5c9ce6',
  connectionColor7: '#a586e0',
  connectionColor8: '#d977ac',
  iconColorBlue: '#6ca6e8',
  iconColorOrange: '#d99a66',
  iconColorYellow: '#d4b45c',
  iconColorGreen: '#7bc86c',
  iconColorTeal: '#56b8b0',
  iconColorPurple: '#a586e0',
  iconColorPink: '#d977ac',
  iconColorSlate: '#8a949e',
  iconColorEmerald: '#6cbf7c',
  iconColorBrown: '#b59276',
  iconColorCyan: '#58b7c9',
  iconColorGray: '#9a9a9a',
  iconColorMuted: '#6e6e6e',
  indicatorRingSoft: '0 0 0 1px rgba(255, 255, 255, 0.14)',
  brandAccent: '#e8a87c',
  brandAccentSoftBg: 'rgba(232, 168, 124, 0.15)',
  radiusSm: '4px',
  radiusMd: '6px',
}
```

`lightThemeTokens` 整体替换为：

```ts
export const lightThemeTokens: AppThemeTokens = {
  appBg: '#f8f8f8',
  appText: 'rgba(0, 0, 0, 0.85)',
  appTextMuted: 'rgba(0, 0, 0, 0.65)',
  appTextSubtle: 'rgba(0, 0, 0, 0.45)',
  surface: '#ffffff',
  surfaceElevated: '#ffffff',
  surfaceMuted: '#f3f3f3',
  surfaceHover: 'rgba(0, 0, 0, 0.045)',
  surfaceActive: 'rgba(53, 116, 240, 0.12)',
  surfaceOverlay: '#ffffff',
  border: '#e5e5e5',
  borderStrong: '#d4d4d4',
  borderMuted: '#efefef',
  primary: '#3574f0',
  primaryHoverBg: 'rgba(53, 116, 240, 0.08)',
  primaryActiveBg: 'rgba(53, 116, 240, 0.14)',
  primarySoftBg: 'rgba(53, 116, 240, 0.05)',
  primaryBorder: 'rgba(53, 116, 240, 0.35)',
  danger: '#e5484d',
  dangerHover: '#f0666a',
  dangerSoftBg: 'rgba(229, 72, 77, 0.07)',
  dangerBorder: 'rgba(229, 72, 77, 0.25)',
  warning: '#d19000',
  warningSoftBg: 'rgba(209, 144, 0, 0.12)',
  warningText: '#7a5b00',
  success: '#2da44e',
  successSoftBg: 'rgba(45, 164, 78, 0.10)',
  successText: '#1f7a3c',
  headerBg: '#f3f3f3',
  headerBorder: '#e5e5e5',
  sidebarBg: '#f3f3f3',
  tabBarBg: '#f3f3f3',
  tabActiveBg: '#ffffff',
  toolbarBg: '#f3f3f3',
  overlayBg: '#ffffff',
  overlayBorder: '#d4d4d4',
  scrollbarThumb: '#cfcfcf',
  scrollbarThumbHover: '#b8b8b8',
  shadowOverlay: '0 6px 20px rgba(0, 0, 0, 0.14)',
  shadowSoft: '0 1px 2px rgba(0, 0, 0, 0.06)',
  swatchRing: '0 0 0 1px rgba(15, 23, 42, 0.12)',
  focusRingPrimary: '0 0 0 2px rgba(53, 116, 240, 0.30)',
  windowCloseHoverBg: '#e81123',
  colorOnDanger: '#ffffff',
  connectionColor1: '#ef4444',
  connectionColor2: '#f97316',
  connectionColor3: '#eab308',
  connectionColor4: '#22c55e',
  connectionColor5: '#14b8a6',
  connectionColor6: '#3b82f6',
  connectionColor7: '#8b5cf6',
  connectionColor8: '#ec4899',
  iconColorBlue: '#3b7dd8',
  iconColorOrange: '#d97a2e',
  iconColorYellow: '#c9971a',
  iconColorGreen: '#3f9e3f',
  iconColorTeal: '#159e93',
  iconColorPurple: '#7a52c7',
  iconColorPink: '#d24a8e',
  iconColorSlate: '#607d8b',
  iconColorEmerald: '#2e9e50',
  iconColorBrown: '#8d6e5c',
  iconColorCyan: '#1195ac',
  iconColorGray: '#8c8c8c',
  iconColorMuted: '#bfbfbf',
  indicatorRingSoft: '0 0 0 1px rgba(15, 23, 42, 0.08)',
  brandAccent: '#b4713d',
  brandAccentSoftBg: 'rgba(232, 168, 124, 0.18)',
  radiusSm: '4px',
  radiusMd: '6px',
}
```

- [ ] **Step 2: CSS_VAR_MAP 追加映射**

`src/hooks/useThemeVariables.ts` 的 `CSS_VAR_MAP` 中 `['--indicator-ring-soft', 'indicatorRingSoft'],` 一行后插入：

```ts
  ['--brand-accent', 'brandAccent'],
  ['--brand-accent-soft-bg', 'brandAccentSoftBg'],
```

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: tsc + vite 通过（若 interface 字段顺序与对象不一致会在此报错）。

- [ ] **Step 4: 视觉冒烟**

Run: `npm run tauri:dev`，亮暗两主题各确认：应用底色/边栏/tab 条变为新灰阶；选中/主按钮变工具蓝；无残留 antd 出厂蓝（树选中、tab 激活文字、链接）。

- [ ] **Step 5: Commit**

```bash
git add src/theme/tokens.ts src/hooks/useThemeVariables.ts
git commit -m "feat(ui): repaint theme tokens to neutral-gray IDE palette with tool blue"
```

---

### Task 2: ConfigProvider 映射 + 密度变量（批 A 收口）

**Files:**
- Modify: `src/App.tsx:24-34`（token 映射）
- Modify: `src/styles/global.css`（`:root` 密度变量块）

**Interfaces:**
- Produces: CSS 变量 `--font-size-base:13px`、`--font-size-sm:12px`、`--row-height-tree:26px`、`--row-height-grid:32px`、`--toolbar-height:32px`、`--tabbar-height:32px`、`--statusbar-height:24px`、`--activitybar-width:40px`（后续任务消费；主题无关，静态定义）。

- [ ] **Step 1: App.tsx token 映射更新**

`ConfigProvider` 的 `token` 对象替换为：

```tsx
        token: {
          fontFamily: interfaceFontFamily,
          fontSize: 13,
          controlHeight: 28,
          colorPrimary: activeTokens.primary,
          colorBgBase: activeTokens.appBg,
          colorBgContainer: activeTokens.surface,
          colorBgElevated: activeTokens.surfaceElevated,
          colorBorder: activeTokens.border,
          colorText: activeTokens.appText,
          colorTextSecondary: activeTokens.appTextSubtle,
          borderRadius: Number.parseInt(activeTokens.radiusSm, 10) || 4,
        },
```

- [ ] **Step 2: global.css 追加密度变量**

`src/styles/global.css` 中 `--header-height: 32px` 所在的 `:root` 块内追加（若该变量在其他选择器内，则新开一个 `:root` 块置于文件头部注释之后）：

```css
  /* 密度 token（主题无关；设计文档 §5） */
  --font-size-base: 13px;
  --font-size-sm: 12px;
  --row-height-tree: 26px;
  --row-height-grid: 32px;
  --toolbar-height: 32px;
  --tabbar-height: 32px;
  --statusbar-height: 24px;
  --activitybar-width: 40px;
```

- [ ] **Step 3: 构建 + 冒烟**

Run: `npm run build`；`npm run tauri:dev` 确认 antd 控件（按钮/输入框/下拉）高度收窄、圆角变 4px，对话框仍可正常操作。

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/styles/global.css
git commit -m "feat(ui): tighten antd control density and add density css tokens"
```

---

### Task 3: 网格与全局密度落地（批 B）

**Files:**
- Modify: `src/components/grid/ResultGrid.tsx:23`（行高常量）
- Modify: `src/components/data/DataEditGrid.tsx:29`（行高常量）
- Modify: `src/components/grid/agGridTheme.ts`（字号/表头背景）

**Interfaces:**
- Consumes: 无（常量本文件内消费，触底计算 `getDisplayedRowCount() * ROW_HEIGHT` 自动跟随）。

- [ ] **Step 1: 行高常量 36 → 32**

`src/components/grid/ResultGrid.tsx`：

```ts
export const RESULT_GRID_ROW_HEIGHT = 32
```

`src/components/data/DataEditGrid.tsx`：

```ts
export const DATA_GRID_ROW_HEIGHT = 32
```

- [ ] **Step 2: agGridTheme 参数更新**

`src/components/grid/agGridTheme.ts` 中三处参数改为：

```ts
  headerBackgroundColor: 'var(--surface-muted)',
  fontSize: 13,
  headerFontSize: 12,
```

（其余参数不变；`headerFontSize` 保持 12 并配 600 字重，形成表头小一号的 IDE 惯例。）

- [ ] **Step 3: 构建 + 冒烟**

Run: `npm run build`；`tauri:dev` 打开一个大结果集：行高 32、滚动触底续页仍工作（触底计算依赖同一常量）；表数据编辑网格同样生效；树行高已是 26px（无需改动，目检确认）。

- [ ] **Step 4: Commit**

```bash
git add src/components/grid/ResultGrid.tsx src/components/data/DataEditGrid.tsx src/components/grid/agGridTheme.ts
git commit -m "feat(ui): apply 32px grid density and muted grid header"
```

---

### Task 4: 活动图标栏（批 C-1，唯一新组件）

**Files:**
- Create: `src/components/layout/ActivityBar.tsx`
- Create: `src/components/layout/ActivityBar.module.css`
- Modify: `src/views/HomeView.tsx`（`contentContainer` 首列插入）

**Interfaces:**
- Consumes: `useAppStore` 的 `sidebarCollapsed` / `toggleSidebar`（已存在，`src/stores/appStore.ts:49,60`）。
- Produces: `ActivityBarProps { onOpenSearch(): void; onOpenSettings(): void }`（sidebar 状态组件内部直连 appStore，不经 props）。

- [ ] **Step 1: 创建 ActivityBar.tsx**

```tsx
import { useTranslation } from 'react-i18next'
import { DatabaseOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons'
import { Tooltip } from 'antd'
import { useAppStore } from '../../stores/appStore'
import styles from './ActivityBar.module.css'

export interface ActivityBarProps {
  onOpenSearch: () => void
  onOpenSettings: () => void
}

/** VS Code 式活动图标栏（设计文档 §6.1）。侧栏收起复用 sidebar_collapsed 合约。 */
export default function ActivityBar({ onOpenSearch, onOpenSettings }: ActivityBarProps) {
  const { t } = useTranslation()
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  return (
    <nav className={styles.activityBar}>
      <div className={styles.brandMark} title="Kudu">
        <img src="/kudu-mark.svg" alt="" className={styles.brandIcon} />
      </div>
      <Tooltip title={t('common.database')} placement="right">
        <button
          type="button"
          className={`${styles.actButton} ${!sidebarCollapsed ? styles.active : ''}`}
          onClick={toggleSidebar}
        >
          <DatabaseOutlined />
        </button>
      </Tooltip>
      <Tooltip title={t('common.search')} placement="right">
        <button type="button" className={styles.actButton} onClick={onOpenSearch}>
          <SearchOutlined />
        </button>
      </Tooltip>
      <div className={styles.spacer} />
      <Tooltip title={t('common.settings')} placement="right">
        <button type="button" className={styles.actButton} onClick={onOpenSettings}>
          <SettingOutlined />
        </button>
      </Tooltip>
    </nav>
  )
}
```

- [ ] **Step 2: 创建 ActivityBar.module.css**

```css
.activityBar {
  width: var(--activitybar-width);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0 8px;
  gap: 2px;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border-color);
}

.brandMark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-bottom: 4px;
}

.brandIcon {
  width: 18px;
  height: 18px;
  /* kudu-mark.svg 本身即品牌橙，无需滤镜换色（设计文档 §4.5） */
  opacity: 0.9;
}

.actButton {
  position: relative;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--app-text-subtle);
  font-size: 16px;
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s;
}

.actButton:hover {
  color: var(--app-text);
  background: var(--surface-hover);
}

.actButton.active {
  color: var(--app-text);
}

.actButton.active::before {
  content: '';
  position: absolute;
  left: -4px;
  top: 7px;
  bottom: 7px;
  width: 2px;
  border-radius: 1px;
  background: var(--color-primary);
}

.spacer {
  flex: 1;
}
```

- [ ] **Step 3: HomeView 集成**

`src/views/HomeView.tsx`：顶部 import 区加入 `import ActivityBar from '../components/layout/ActivityBar'`；`<div className={styles.contentContainer}>` 的第一个子元素（`sidebarWrapper` 之前）插入：

```tsx
        <ActivityBar
          onOpenSearch={() => setShowGlobalSearch(true)}
          onOpenSettings={openSettings}
        />
```

- [ ] **Step 4: 构建 + 冒烟**

Run: `npm run build`；`tauri:dev` 确认：活动栏出现在最左；数据库按钮收起/展开侧栏且与「视图菜单-折叠侧栏」状态互通（同一 storage key）；重启后收起态保持；搜索/设置按钮工作；激活指示条只在侧栏展开时显示。

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/ActivityBar.tsx src/components/layout/ActivityBar.module.css src/views/HomeView.tsx
git commit -m "feat(ui): add vscode-style activity bar"
```

---

### Task 5: 状态栏信息重组（批 C-2）

**Files:**
- Modify: `src/components/layout/AppStatusBar.tsx`（全文件替换）
- Modify: `src/components/layout/AppStatusBar.module.css`（全文件替换）

**Interfaces:**
- Consumes: `AppStatusBarProps` **不变**（八个成员，HomeView 调用点零改动）。

- [ ] **Step 1: 替换 AppStatusBar.tsx**

```tsx
import { useTranslation } from 'react-i18next'
import { DatabaseOutlined, LoadingOutlined, PartitionOutlined } from '@ant-design/icons'
import type { ConnectionStatus } from '@/types/database'
import type { SqlExecutionState } from '@/types/sqlExecution'
import styles from './AppStatusBar.module.css'

export interface AppStatusBarProps {
  connectionName: string
  databaseName: string
  schemaName: string
  readOnly: boolean
  connectionStatus: ConnectionStatus
  executionState: SqlExecutionState | null
  rightPanelCollapsed?: boolean
  onToggleRightPanel?: () => void
}

const STATUS_PILL_CLASS: Record<ConnectionStatus, string> = {
  connected: 'pillConnected',
  connecting: 'pillConnecting',
  disconnected: 'pillDisconnected',
  error: 'pillError',
}

export default function AppStatusBar({
  connectionName,
  databaseName,
  schemaName,
  readOnly,
  connectionStatus,
  executionState,
  rightPanelCollapsed = true,
  onToggleRightPanel,
}: AppStatusBarProps) {
  const { t } = useTranslation()

  const running = executionState?.status === 'running'
  const taskStatusLabel = (() => {
    const state = executionState
    if (!state || state.status === 'idle') return t('status_bar.idle')
    if (state.status === 'running') return state.summary || t('status_bar.running')
    if (state.status === 'success') return state.summary || t('status_bar.completed')
    if (state.status === 'partial_success') return state.summary || t('status_bar.completed_with_warnings')
    if (state.status === 'cancelled') return state.summary || t('status_bar.cancelled')
    return state.summary || t('status_bar.failed')
  })()

  return (
    <footer className={styles.statusBar}>
      {/* 左段：连接上下文（设计文档 §6.2） */}
      <div className={styles.segment}>
        <span className={`${styles.pill} ${styles[STATUS_PILL_CLASS[connectionStatus]]}`}>
          <span className={styles.pillDot} />
          {connectionName}
        </span>
        <span className={styles.item} title={t('status_bar.database')}>
          <DatabaseOutlined className={styles.itemIcon} />
          {databaseName}
        </span>
        <span className={styles.item} title={t('status_bar.schema')}>
          <PartitionOutlined className={styles.itemIcon} />
          {schemaName}
        </span>
        {readOnly && (
          <span className={`${styles.pill} ${styles.pillReadonly}`}>{t('status_bar.read_only')}</span>
        )}
      </div>

      {/* 右段：执行反馈 + 面板开关 */}
      <div className={styles.segment}>
        <span className={styles.item}>
          {running && <LoadingOutlined className={styles.itemIcon} spin />}
          {taskStatusLabel}
        </span>
        <button
          type="button"
          className={`${styles.panelToggle} ${!rightPanelCollapsed ? styles.panelToggleActive : ''}`}
          title={rightPanelCollapsed ? t('right_panel.show') : t('right_panel.hide')}
          onClick={() => onToggleRightPanel?.()}
        >
          i
        </button>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: 替换 AppStatusBar.module.css**

```css
.statusBar {
  height: var(--statusbar-height);
  min-height: var(--statusbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 10px;
  border-top: 1px solid var(--border-color);
  background: var(--surface-muted);
  color: var(--app-text-subtle);
  font-size: var(--font-size-sm);
  line-height: 1;
}

.segment {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text-subtle);
}

.itemIcon {
  font-size: 11px;
  opacity: 0.8;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 16px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

.pillDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.pillConnected { background: var(--color-success-soft-bg); color: var(--color-success-text); }
.pillConnecting { background: var(--color-primary-soft-bg); color: var(--color-primary); }
.pillDisconnected { background: var(--surface-hover); color: var(--app-text-subtle); }
.pillError { background: var(--color-danger-soft-bg); color: var(--color-danger); }

.pillReadonly {
  background: var(--brand-accent-soft-bg);
  color: var(--brand-accent);
}

.panelToggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--app-text-subtle);
  font-family: Georgia, 'Times New Roman', serif;
  font-style: italic;
  font-size: 11px;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.panelToggle:hover {
  background: var(--surface-hover);
  color: var(--app-text);
}

.panelToggleActive {
  color: var(--color-primary);
  border-color: var(--color-primary-border);
}
```

- [ ] **Step 3: 构建 + 冒烟**

Run: `npm run build`；`tauri:dev` 确认：断开态灰 pill / 连接后绿 pill / 错误红 pill；只读连接显示暖橙徽章；执行查询时右段出现 spinner + 耗时、完成后行数摘要；i 按钮开合右面板；高度 24px。

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/AppStatusBar.tsx src/components/layout/AppStatusBar.module.css
git commit -m "feat(ui): regroup status bar into context and feedback segments"
```

---

### Task 6: SQL 工具栏重排（批 C-3）

**Files:**
- Modify: `src/components/editor/SqlToolbar.tsx`（分组与溢出菜单重排；search_path Popover 逻辑不动）
- Modify: `src/components/editor/SqlToolbar.module.css`（高度与分组样式）

**Interfaces:**
- Consumes: `SqlToolbarProps` 与 `SqlToolbarAction` **均不变**（SqlEditor 调用点零改动）。

- [ ] **Step 1: 重排 SqlToolbar.tsx 的 JSX**

保留文件头部、`SqlToolbarAction`、props、search_path 编辑器逻辑（第 50-128 行）全部不动。import 区改为：

```tsx
import { Button, Divider, Dropdown, Input, Popover, Select, Space, Tag, Tooltip } from 'antd'
import type { InputRef } from 'antd'
import type { MenuProps } from 'antd'
import {
  ApartmentOutlined, ClearOutlined, CodeOutlined, DatabaseOutlined, EllipsisOutlined,
  FileAddOutlined, FormatPainterOutlined, HistoryOutlined, PlayCircleFilled, PlusOutlined,
  SaveOutlined, SearchOutlined, StopOutlined, SyncOutlined, TableOutlined,
} from '@ant-design/icons'
```

组件内、`return` 之前加入溢出菜单定义：

```tsx
  const overflowItems: MenuProps['items'] = [
    { key: 'saveAsFile', icon: <FileAddOutlined />, label: t('editor.save_as') },
    { key: 'clearEditor', icon: <ClearOutlined />, label: t('common.clear') },
    { key: 'refreshAutocomplete', icon: <SyncOutlined />, label: t('common.refresh') },
  ]
```

`return` 的 JSX 替换为（设计文档 §6.3 三组 + 溢出 + 右端上下文）：

```tsx
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarLeft}>
        <div className={styles.toolbarGroup}>
          <Tooltip title={`${t('common.run')} (F5)`}>
            <Button
              type="text" size="small" disabled={executing}
              className={`${styles.btnRun} ${executing ? styles.running : ''}`}
              icon={<PlayCircleFilled />}
              onClick={() => onAction('executeQuery')}
            />
          </Tooltip>
          <Tooltip title={t('common.stop')}>
            <Button
              type="text" size="small" disabled={!executing}
              className={`${styles.btnStop} ${executing ? styles.active : ''}`}
              icon={<StopOutlined />}
              onClick={() => onAction('stopExecution')}
            />
          </Tooltip>
          <Tooltip title={t('common.explain')}>
            <Button type="text" size="small" disabled={executing} icon={<SearchOutlined />} onClick={() => onAction('explainQuery')} />
          </Tooltip>
        </div>
        <Divider type="vertical" />
        <div className={styles.toolbarGroup}>
          <Tooltip title={t('common.format')}>
            <Button type="text" size="small" icon={<FormatPainterOutlined />} onClick={() => onAction('formatSql')} />
          </Tooltip>
          <Tooltip title={`${t('common.save')} (Ctrl+S)`}>
            <Button type="text" size="small" icon={<SaveOutlined />} onClick={() => onAction('handleSave')} />
          </Tooltip>
        </div>
        <Divider type="vertical" />
        <div className={styles.toolbarGroup}>
          <Tooltip title={t('common.history')}>
            <Button type="text" size="small" icon={<HistoryOutlined />} onClick={() => onAction('openHistory')} />
          </Tooltip>
          <Tooltip title={t('common.snippets')}>
            <Button type="text" size="small" icon={<CodeOutlined />} onClick={() => onAction('openSnippets')} />
          </Tooltip>
          <Dropdown
            menu={{ items: overflowItems, onClick: ({ key }) => onAction(key as SqlToolbarAction) }}
            trigger={['click']}
          >
            <Button type="text" size="small" icon={<EllipsisOutlined />} />
          </Dropdown>
        </div>
      </div>

      <div className={styles.toolbarRight}>
        <div className={styles.toolbarRightSection}>
          <DatabaseOutlined className={styles.contextIcon} />
          <Select
            value={selectedDatabase}
            placeholder={t('common.database')}
            size="small"
            className={styles.databaseSelect}
            onChange={(val) => onDatabaseChange(String(val ?? ''))}
            options={[
              { value: '', label: t('editor.default_database') },
              ...databases.map((db) => ({ value: db.name, label: db.name })),
            ]}
          />
        </div>
        {showSearchPath && (
          <div className={styles.toolbarRightSection}>
            <Popover
              open={searchPathEditorOpen}
              onOpenChange={setSearchPathEditorOpen}
              trigger="click"
              placement="bottomRight"
              content={searchPathEditorContent}
            >
              <Button type="text" size="small" className={styles.searchPathTrigger} icon={<ApartmentOutlined />}>
                <span className={styles.searchPathText}>{searchPathDisplay}</span>
              </Button>
            </Popover>
          </div>
        )}
        <Divider type="vertical" />
        <Tooltip title={t('editor.result')}>
          <Button
            type="text" size="small"
            className={`${styles.resultToggleBtn} ${resultPanelVisible ? styles.active : ''}`}
            icon={<TableOutlined />}
            onClick={() => onAction('toggleResultPanel')}
          />
        </Tooltip>
      </div>
    </div>
  )
```

（变化：执行组顺序 run/stop/explain；save-as/clear/refresh 移入溢出 Dropdown；「数据库」「search_path」文字标签删除，改图标前缀；`toolbarLabel` 样式类不再使用，可从 css 删除。）

- [ ] **Step 2: SqlToolbar.module.css 调整**

`.toolbar` 规则的高度与背景改为（其余组内样式保留）：

```css
.toolbar {
  height: var(--toolbar-height);
  min-height: var(--toolbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px;
  background: var(--toolbar-bg);
  border-bottom: 1px solid var(--border-color);
}
```

追加：

```css
.contextIcon {
  font-size: 12px;
  color: var(--app-text-subtle);
}
```

删除 `.toolbarLabel` 规则（已无消费者）。

- [ ] **Step 3: 构建 + 冒烟**

Run: `npm run build`；`tauri:dev` 确认：三组图标 + 溢出菜单内另存为/清空/刷新补全全部触发原动作；F5/Ctrl+S 快捷键不受影响；PG 连接显示 search_path 触发器；结果面板开关正常。

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/SqlToolbar.tsx src/components/editor/SqlToolbar.module.css
git commit -m "feat(ui): regroup sql toolbar with overflow menu and icon-only context"
```

---

### Task 7: Monaco 自定义主题（批 D-1）

**Files:**
- Modify: `src/utils/monacoLoader.ts`（加载后定义主题）
- Modify: `src/hooks/useMonacoEditor.ts`（主题名替换）

**Interfaces:**
- Produces: Monaco 主题名 `'kudu-dark'` / `'kudu-light'`（取代 `'vs-dark'` / `'vs'` 的使用点）。

- [ ] **Step 1: monacoLoader 定义主题**

在 `src/utils/monacoLoader.ts` 中 Monaco 模块加载完成后（单例初始化处，`grep -n "vs-dark\|defineTheme\|editor.create" src/utils/monacoLoader.ts src/hooks/useMonacoEditor.ts` 定位）加入：

```ts
monaco.editor.defineTheme('kudu-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#1f1f1f',
    'editor.lineHighlightBackground': '#242424',
    'editor.selectionBackground': '#3574f04d',
    'editorLineNumber.foreground': '#5a5a5a',
    'editorLineNumber.activeForeground': '#a8a8a8',
    'editorGutter.background': '#1f1f1f',
  },
})
monaco.editor.defineTheme('kudu-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#ffffff',
    'editor.lineHighlightBackground': '#f5f5f5',
    'editor.selectionBackground': '#3574f02e',
    'editorLineNumber.foreground': '#b0b0b0',
    'editorLineNumber.activeForeground': '#707070',
  },
})
```

- [ ] **Step 2: 替换主题名**

`src/hooks/useMonacoEditor.ts` 中所有 `'vs-dark'` → `'kudu-dark'`、`'vs'` → `'kudu-light'`（创建参数与主题响应 effect 两处；用 grep 确认无第三处遗漏，`SqlEditor.tsx`/`RedisCommandInput.tsx`/`DdlPreviewModal.tsx`/`DesignerDdlPane` 若有独立主题字符串一并替换）。

- [ ] **Step 3: 构建 + 冒烟**

Run: `npm run build`；`tauri:dev` 确认：SQL 编辑器背景与内容区一致（不再是 Monaco 出厂 `#1e1e1e` 的错位感）；亮暗切换即时生效；Redis 命令行与 DDL 预览同步；选区/当前行高亮为工具蓝系。

- [ ] **Step 4: Commit**

```bash
git add src/utils/monacoLoader.ts src/hooks/useMonacoEditor.ts
git commit -m "feat(ui): add kudu monaco themes aligned with app palette"
```

---

### Task 8: 细节打磨与全局巡检（批 D-2 收口）

**Files:**
- Modify: `src/views/HomeView.module.css:132-138,228-231`（tab 强调条 + dirty 圆点）
- Modify: 巡检中发现的零散 `.module.css`（逐个小改，见 Step 2 清单）

**Interfaces:** 无新接口。

- [ ] **Step 1: 工作区 tab 激活强调条**

`src/views/HomeView.module.css` 的 `.workspaceTabs :global(.ant-tabs-tab-active)` 替换为：

```css
.workspaceTabs :global(.ant-tabs-tab-active) {
  background: var(--tab-active-bg) !important;
  box-shadow: inset 0 2px 0 var(--color-primary);
}
```

`.workspaceTabs :global(.ant-tabs-tab-active .ant-tabs-tab-btn)` 的颜色改为 `color: var(--app-text);`（激活态靠强调条而非文字变蓝——IDE 惯例）。`.tabDirtyIndicator` 的颜色改为 `color: var(--color-primary);`。

- [ ] **Step 2: 全局巡检清单（亮暗两主题各过一遍，逐项小修）**

按迁移计划第 8 章矩阵页面顺序目检，重点核对并修正：
1. 连接面板：颜色条/状态徽章/搜索框在新灰阶下的对比度；
2. 数据库树：iconify 品牌图标观感（图标色 token 已在 Task 1 降饱和，检查 `getIconConfig` 是否有硬编码色值——`grep -n "#[0-9a-fA-F]\{6\}" src/components/database/TreeNodeItem.tsx src/components/database/treeModel.ts`，有则替换为对应 `var(--icon-color-*)`）；
3. `Modal.confirm` 系（危险 SQL 确认、drop/truncate 约 15 处）：新圆角/阴影/按钮色下可读性；
4. 右侧面板三页、设置页、Redis 工作区、全局搜索、QueryBuilder/DataCompare/ER 图：只需确认 token 联动无破相（如深色下白底残留），发现即修；
5. `grep -rn "1677ff\|177ddc" src/` 应为 0 命中（残留出厂蓝清理）。

- [ ] **Step 3: 构建 + 全量验证**

Run: `npm run build && npx vitest run`
Expected: build 通过、36/36（纯函数单测与 UI 无关，应全绿）。
`npm run tauri:dev` 亮暗两主题按第 8 章矩阵全页面走查。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): polish tabs, icons and sweep remaining legacy colors"
```

- [ ] **Step 5: 更新设计文档状态**

在 `docs/superpowers/specs/2026-07-12-kudu-ui-redesign-design.md` 文末追加实施完成记录（日期 + 各批 commit hash），单独提交：

```bash
git add docs/superpowers/specs/2026-07-12-kudu-ui-redesign-design.md
git commit -m "docs: record ui redesign implementation completion"
```
