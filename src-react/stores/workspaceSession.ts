import { TabType, type TabState } from '@/types/workspace'
import type { RawSessionState } from '@/api/workspace'

/**
 * 会话序列化纯函数（对等 Vue 版 stores/workspace.ts 的同名函数，逻辑逐行平移）。
 *
 * 独立成模块的原因（D11）：这两个转换是「纯输入输出、回归代价高（会话损坏）」的
 * 单测目标，模块内不引入 i18n/store/tauri 等运行时依赖（RawSessionState 仅作类型导入，
 * 运行时被擦除），vitest 在 node 环境可直接加载。
 * settings 标题的本地化经 translateSettingsTitle 注入（store 侧传 i18next）。
 *
 * 合约红线（迁移计划 2.4/5 节）：
 * - snake_case 字段名与 8 种可持久化 tab 类型集合不可改动；
 * - dirty/designTab/designAction/autoExecuteNonce 不持久化；
 * - 恢复时 dirty 固定 false、active key 缺失时回退第一个 tab。
 */

export const SESSION_PERSISTABLE_TAB_TYPES = new Set<TabType>([
  TabType.Query,
  TabType.Redis,
  TabType.Data,
  TabType.Design,
  TabType.Builder,
  TabType.Compare,
  TabType.ErDiagram,
  TabType.Settings,
])

export function toRawSessionState(tabs: TabState[], activeKey: string): RawSessionState {
  const persistableTabs = tabs.filter(tab => SESSION_PERSISTABLE_TAB_TYPES.has(tab.type))
  const fallbackActiveKey = persistableTabs.some(tab => tab.key === activeKey)
    ? activeKey
    : (persistableTabs[0]?.key || '')

  return {
    open_tabs: persistableTabs.map(tab => ({
      key: tab.key,
      title: tab.title,
      type: tab.type,
      connection_id: tab.connectionId,
      database: tab.database,
      schema: tab.schema,
      table: tab.table,
      content: tab.content,
      file_path: tab.filePath,
      read_only: tab.readOnly,
      is_untitled: tab.isUntitled,
    })),
    active_tab_key: fallbackActiveKey,
  }
}

function resolvePersistedTabTitle(
  tab: RawSessionState['open_tabs'][number],
  translateSettingsTitle: () => string,
): string {
  if (tab.type === TabType.Settings) {
    return translateSettingsTitle()
  }

  return tab.title
}

export function fromRawSessionState(
  session: RawSessionState,
  translateSettingsTitle: () => string,
): { open_tabs: TabState[], active_tab_key: string } {
  const openTabs = session.open_tabs.map((tab) => ({
    key: tab.key,
    title: resolvePersistedTabTitle(tab, translateSettingsTitle),
    type: tab.type as TabType,
    connectionId: tab.connection_id,
    database: tab.database,
    schema: tab.schema,
    table: tab.table,
    content: tab.content,
    filePath: tab.file_path,
    readOnly: tab.read_only,
    dirty: false,
    isUntitled: tab.is_untitled,
  }))

  return {
    open_tabs: openTabs,
    active_tab_key: openTabs.some(tab => tab.key === session.active_tab_key)
      ? session.active_tab_key
      : (openTabs[0]?.key || ''),
  }
}
