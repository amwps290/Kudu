import { nextTick, type ComputedRef, type Ref } from 'vue'
import { open, save } from '@tauri-apps/plugin-dialog'
import { message } from '@/ui/antd'
import { utilsApi, SQL_FILE_FILTERS } from '@/api'
import { TabType } from '@/types/workspace'
import type { DataTab } from '@/composables/useTabManager'
import type { ReturnTypeUseConnectionStore } from '@/types/internal'
import { getErrorMessage } from '@/utils/errorHandler'

export interface SqlDocumentInput {
  connectionId?: string
  database?: string
  filePath?: string
  title?: string
  content?: string
  autoExecuteNonce?: string
}

interface SqlDocumentActionsOptions {
  mainTabKey: Ref<string>
  dataTabs: Ref<DataTab[]>
  isSqlSupported: ComputedRef<boolean>
  connectionStore: ReturnTypeUseConnectionStore
  findTabByKey: (key: string) => DataTab | undefined
  addTab: (tab: DataTab) => void
  handleFileSaved: (key: string, path: string, title: string) => void
  callActiveEditor: (method: string, ...args: unknown[]) => unknown
  t: (key: string, options?: Record<string, unknown>) => string
}

export function useSqlDocumentActions(options: SqlDocumentActionsOptions) {
  async function focusQueryTab(tabKey: string) {
    const tab = options.findTabByKey(tabKey)
    if (!tab || tab.type !== TabType.Query) return false

    if (options.mainTabKey.value !== tabKey) {
      options.mainTabKey.value = tabKey
      await nextTick()
    }

    return true
  }

  function generateNextUntitledTitle() {
    const used = new Set(
      options.dataTabs.value
        .map(tab => /^未命名-(\d+)\.sql$/i.exec(tab.title)?.[1] || /^untitled-(\d+)\.sql$/i.exec(tab.title)?.[1])
        .filter((value): value is string => Boolean(value))
        .map(value => Number(value))
        .filter(value => Number.isInteger(value) && value > 0)
    )

    let index = 1
    while (used.has(index)) index += 1
    return `untitled-${index}.sql`
  }

  function resolveQueryTitle(data: SqlDocumentInput) {
    if (data.title) return data.title
    if (data.filePath) return data.filePath.split(/[\\/]/).pop() || data.filePath
    return generateNextUntitledTitle()
  }

  function resolveQueryDatabase(connectionId?: string, database?: string) {
    if (database) return database
    if (!connectionId) return database

    const connection = options.connectionStore.connections.find(item => item.id === connectionId)
    if (connection?.db_type === 'sqlite') {
      return 'main'
    }

    return database
  }

  async function openOrCreateQueryTab(data: SqlDocumentInput) {
    if (!options.isSqlSupported.value) return false

    const connectionId = data.connectionId || options.connectionStore.activeConnectionId || undefined
    const database = resolveQueryDatabase(connectionId, data.database)

    if (data.filePath) {
      const existingTab = options.dataTabs.value.find(tab => tab.type === TabType.Query && tab.filePath === data.filePath)
      if (existingTab) {
        options.mainTabKey.value = existingTab.key
        return true
      }
    }

    const key = `query-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const isOpeningFile = Boolean(data.filePath)
    options.addTab({
      key,
      title: resolveQueryTitle(data),
      type: TabType.Query,
      connectionId: connectionId || undefined,
      database,
      content: data.content || '',
      filePath: data.filePath,
      dirty: false,
      isUntitled: !isOpeningFile,
      autoExecuteNonce: data.autoExecuteNonce,
    })

    return true
  }

  async function openQueryFile() {
    const selected = await open({
      filters: [...SQL_FILE_FILTERS],
      multiple: false,
    })

    if (!selected || Array.isArray(selected)) return false

    try {
      const content = await utilsApi.readFile(selected)
      return openOrCreateQueryTab({
        filePath: selected,
        content,
        title: selected.split(/[\\/]/).pop() || selected,
      })
    } catch (error: unknown) {
      message.error(`${options.t('common.fail')}: ${getErrorMessage(error)}`)
      return false
    }
  }

  function getDocumentContent(tab: DataTab) {
    return tab.content || ''
  }

  function buildSuggestedFileName(tab: DataTab) {
    const candidate = tab.filePath?.split(/[\\/]/).pop() || tab.title || 'query.sql'
    return candidate.toLowerCase().endsWith('.sql') ? candidate : `${candidate}.sql`
  }

  async function saveQueryTab(tabKey: string) {
    const tab = options.findTabByKey(tabKey)
    if (!tab || tab.type !== TabType.Query) return false

    const content = getDocumentContent(tab)
    if (!content.trim()) return false

    if (!tab.filePath) {
      return saveQueryTabAs(tabKey)
    }

    await utilsApi.writeFile(tab.filePath, content)
    options.handleFileSaved(tabKey, tab.filePath, tab.filePath.split(/[\\/]/).pop() || tab.title)
    return true
  }

  async function saveQueryTabAs(tabKey: string) {
    const tab = options.findTabByKey(tabKey)
    if (!tab || tab.type !== TabType.Query) return false

    const content = getDocumentContent(tab)
    if (!content.trim()) return false

    const filePath = await save({
      defaultPath: tab.filePath || buildSuggestedFileName(tab),
      filters: [...SQL_FILE_FILTERS],
    })
    if (!filePath) return false

    const saved = await utilsApi.saveFileAs({ path: filePath, content })
    options.handleFileSaved(tabKey, saved.path, saved.title)
    return true
  }

  async function saveActiveQueryTab() {
    return saveQueryTab(options.mainTabKey.value)
  }

  async function saveActiveQueryTabAs() {
    return saveQueryTabAs(options.mainTabKey.value)
  }

  async function focusActiveQueryEditor() {
    const ok = await focusQueryTab(options.mainTabKey.value)
    if (!ok) return false
    options.callActiveEditor('focusEditor')
    return true
  }

  return {
    openOrCreateQueryTab,
    openQueryFile,
    saveQueryTab,
    saveQueryTabAs,
    saveActiveQueryTab,
    saveActiveQueryTabAs,
    focusActiveQueryEditor,
  }
}
