import { describe, expect, it } from 'vitest'
import { TabType, type TabState } from '@/types/workspace'
import type { RawSessionState } from '@/api/workspace'
import {
  SESSION_PERSISTABLE_TAB_TYPES,
  fromRawSessionState,
  toRawSessionState,
} from './workspaceSession'

const settingsTitle = () => '设置'

function makeQueryTab(overrides: Partial<TabState> = {}): TabState {
  return {
    key: 'query-1',
    title: 'untitled-1.sql',
    type: TabType.Query,
    connectionId: 'conn-a',
    database: 'db1',
    schema: 'public',
    table: undefined,
    content: 'SELECT 1',
    filePath: 'C:\\sql\\a.sql',
    readOnly: false,
    dirty: true,
    isUntitled: false,
    ...overrides,
  }
}

describe('SESSION_PERSISTABLE_TAB_TYPES', () => {
  it('包含全部 8 种 tab 类型（合约红线 2：集合不可改动）', () => {
    expect([...SESSION_PERSISTABLE_TAB_TYPES].sort()).toEqual(
      [
        TabType.Query, TabType.Redis, TabType.Data, TabType.Design,
        TabType.Builder, TabType.Compare, TabType.ErDiagram, TabType.Settings,
      ].sort(),
    )
  })
})

describe('toRawSessionState', () => {
  it('camelCase 字段映射为 snake_case，且不持久化 dirty/designTab/designAction/autoExecuteNonce', () => {
    const tab = makeQueryTab({
      designTab: 'columns',
      designAction: 'add_column',
      autoExecuteNonce: 'nonce-1',
    })

    const raw = toRawSessionState([tab], 'query-1')

    expect(raw.open_tabs).toEqual([{
      key: 'query-1',
      title: 'untitled-1.sql',
      type: 'query',
      connection_id: 'conn-a',
      database: 'db1',
      schema: 'public',
      table: undefined,
      content: 'SELECT 1',
      file_path: 'C:\\sql\\a.sql',
      read_only: false,
      is_untitled: false,
    }])
    expect(raw.active_tab_key).toBe('query-1')
  })

  it('过滤不在持久化集合中的 tab 类型', () => {
    const unknownTab = makeQueryTab({ key: 'x-1', type: 'unknown' as TabType })
    const raw = toRawSessionState([unknownTab, makeQueryTab()], 'query-1')

    expect(raw.open_tabs.map((tab) => tab.key)).toEqual(['query-1'])
  })

  it('activeKey 不在持久化 tabs 中时回退到第一个持久化 tab', () => {
    const raw = toRawSessionState(
      [makeQueryTab({ key: 'q1' }), makeQueryTab({ key: 'q2' })],
      'not-exist',
    )
    expect(raw.active_tab_key).toBe('q1')
  })

  it('无可持久化 tab 时 active_tab_key 为空串', () => {
    expect(toRawSessionState([], 'whatever')).toEqual({ open_tabs: [], active_tab_key: '' })
  })
})

describe('fromRawSessionState', () => {
  const rawSession: RawSessionState = {
    open_tabs: [
      {
        key: 'q1',
        title: 'a.sql',
        type: 'query',
        connection_id: 'conn-a',
        database: 'db1',
        schema: 'public',
        content: 'SELECT 1',
        file_path: 'C:\\sql\\a.sql',
        read_only: true,
        is_untitled: false,
      },
      { key: 's1', title: 'Settings（旧语言标题）', type: 'settings' },
    ],
    active_tab_key: 'q1',
  }

  it('snake_case 映射回 camelCase，dirty 固定 false', () => {
    const { open_tabs } = fromRawSessionState(rawSession, settingsTitle)

    expect(open_tabs[0]).toEqual({
      key: 'q1',
      title: 'a.sql',
      type: TabType.Query,
      connectionId: 'conn-a',
      database: 'db1',
      schema: 'public',
      table: undefined,
      content: 'SELECT 1',
      filePath: 'C:\\sql\\a.sql',
      readOnly: true,
      dirty: false,
      isUntitled: false,
    })
  })

  it('settings tab 标题按当前语言重取，其余 tab 标题原样保留', () => {
    const { open_tabs } = fromRawSessionState(rawSession, settingsTitle)

    expect(open_tabs[1].title).toBe('设置')
    expect(open_tabs[0].title).toBe('a.sql')
  })

  it('active_tab_key 存在时原样保留', () => {
    expect(fromRawSessionState(rawSession, settingsTitle).active_tab_key).toBe('q1')
  })

  it('active_tab_key 不在 tabs 中时回退第一个 tab；空会话回退空串', () => {
    const missing = { ...rawSession, active_tab_key: 'gone' }
    expect(fromRawSessionState(missing, settingsTitle).active_tab_key).toBe('q1')

    expect(fromRawSessionState({ open_tabs: [], active_tab_key: 'gone' }, settingsTitle))
      .toEqual({ open_tabs: [], active_tab_key: '' })
  })

  it('toRaw → fromRaw 往返：持久化字段保持一致，dirty 归零', () => {
    const tabs = [
      makeQueryTab({ key: 'q1', dirty: true }),
      makeQueryTab({ key: 'r1', type: TabType.Redis, title: 'Redis', filePath: undefined }),
    ]
    const restored = fromRawSessionState(toRawSessionState(tabs, 'r1'), settingsTitle)

    expect(restored.active_tab_key).toBe('r1')
    expect(restored.open_tabs.map((tab) => ({ key: tab.key, type: tab.type, dirty: tab.dirty }))).toEqual([
      { key: 'q1', type: TabType.Query, dirty: false },
      { key: 'r1', type: TabType.Redis, dirty: false },
    ])
    expect(restored.open_tabs[0].content).toBe('SELECT 1')
    expect(restored.open_tabs[0].connectionId).toBe('conn-a')
  })
})
