import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Empty, Input, List, Modal, Select, Space, Tabs, Tag } from 'antd'
import {
  CopyOutlined, EyeOutlined, FileOutlined, FolderOutlined, SearchOutlined, TableOutlined,
} from '@ant-design/icons'
import { message } from '../../ui/antd'
import { metadataApi } from '@/api'
import type { DatabaseInfo } from '@/types/database'
import { writeClipboardText } from '@/utils/clipboard'
import { useConnectionStore } from '../../stores/connectionStore'
import styles from './GlobalSearch.module.css'

/**
 * 全局搜索（对等 Vue 版 GlobalSearch.vue）。
 * 前端全量拉取 + 客户端过滤的 N+1 现状保留（已知业务问题 5，仅回车触发是刻意行为）；
 * scope 规则照抄（非 PG 才显示存储过程）；v-html 高亮改**分段渲染**（计划 Slice 21 要点）。
 * 走 Slice 2 已收编的 metadataApi.getFunctions/getProcedures（含断线自动重连）。
 */

interface SearchResult {
  type: 'table' | 'column' | 'view' | 'procedure' | 'function' | 'trigger'
  name: string
  database?: string
  table?: string
  dataType?: string
  comment?: string
}

interface GlobalSearchProps {
  open: boolean
  connectionId: string | null
  onClose: () => void
  onViewData: (data: { database?: string; table: string }) => void
}

/** 高亮分段渲染（替代 Vue 的 v-html）：split 捕获组后奇数下标即命中片段 */
function HighlightedText({ text, keyword, caseSensitive }: { text: string; keyword: string; caseSensitive: boolean }) {
  if (!keyword) return <>{text}</>
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, caseSensitive ? 'g' : 'gi')
  const parts = text.split(regex)
  return (
    <>
      {parts.map((part, i) => (
        i % 2 === 1
          ? <span key={i} className={styles.highlight}>{part}</span>
          : <span key={i}>{part}</span>
      ))}
    </>
  )
}

export default function GlobalSearch({ open, connectionId, onClose, onViewData }: GlobalSearchProps) {
  const { t } = useTranslation()

  const currentConnection = useConnectionStore((s) => (connectionId ? s.connections.find((conn) => conn.id === connectionId) || null : null))
  const isPostgreSQL = (currentConnection?.db_type || '').toLowerCase() === 'postgresql'

  const [searchText, setSearchText] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchScope, setSearchScope] = useState('all')
  const [selectedDatabase, setSelectedDatabase] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [databases, setDatabases] = useState<DatabaseInfo[]>([])
  const [activeTab, setActiveTab] = useState('all')

  // 打开时加载数据库列表并重置（对等 watch(visible)）
  useEffect(() => {
    if (!open) return
    setSearchResults([])
    setActiveTab('all')
    if (connectionId) {
      void (async () => {
        try {
          setDatabases(await metadataApi.getDatabases(connectionId))
        } catch (error: unknown) {
          console.error('Failed to load databases:', error)
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const resultTypes = [
    { key: 'all', label: t('search.scope_all') },
    { key: 'table', label: t('search.scope_tables') },
    { key: 'column', label: t('search.scope_columns') },
    { key: 'view', label: t('search.scope_views') },
    ...(isPostgreSQL ? [] : [{ key: 'procedure', label: t('search.scope_procedures') }]),
    { key: 'function', label: t('search.scope_functions') },
  ]

  function getIcon(type: string): ReactNode {
    if (type === 'table') return <TableOutlined className={styles.resultIcon} />
    if (type === 'view') return <EyeOutlined className={styles.resultIcon} />
    if (type === 'procedure' || type === 'function' || type === 'trigger') return <FolderOutlined className={styles.resultIcon} />
    return <FileOutlined className={styles.resultIcon} />
  }

  function getTypeName(type: string): string {
    const keyMap: Record<string, string> = {
      table: 'search.type_table',
      column: 'search.type_column',
      view: 'search.type_view',
      procedure: 'search.type_procedure',
      function: 'search.type_function',
      trigger: 'search.type_trigger',
    }
    return keyMap[type] ? t(keyMap[type]) : type
  }

  function getResultCount(type: string): number {
    if (type === 'all') return searchResults.length
    return searchResults.filter((r) => r.type === type).length
  }

  function getResultsByType(type: string): SearchResult[] {
    if (type === 'all') return searchResults
    return searchResults.filter((r) => r.type === type)
  }

  async function handleSearch() {
    if (!searchText || !connectionId) {
      message.warning(t('search.input_required'))
      return
    }

    setSearching(true)
    setSearchResults([])

    try {
      const results: SearchResult[] = []
      const searchPattern = caseSensitive ? searchText : searchText.toLowerCase()

      const databasesToSearch = selectedDatabase
        ? [{ name: selectedDatabase }]
        : databases

      for (const db of databasesToSearch) {
        if (searchScope === 'all' || searchScope === 'tables') {
          const tables = await metadataApi.getTables(connectionId, db.name)
          for (const table of tables) {
            const tableName = caseSensitive ? table.name : table.name.toLowerCase()
            if (tableName.includes(searchPattern)) {
              results.push({ type: 'table', name: table.name, database: db.name, comment: table.comment })
            }
          }
        }

        if (searchScope === 'all' || searchScope === 'columns') {
          const tables = await metadataApi.getTables(connectionId, db.name)
          for (const table of tables) {
            const columns = await metadataApi.getTableStructure({
              connectionId,
              table: table.name,
              schema: table.schema || db.name,
              database: db.name,
            })
            for (const column of columns) {
              const columnName = caseSensitive ? column.name : column.name.toLowerCase()
              if (columnName.includes(searchPattern)) {
                results.push({
                  type: 'column',
                  name: column.name,
                  database: db.name,
                  table: table.name,
                  dataType: column.data_type,
                  comment: column.comment,
                })
              }
            }
          }
        }

        if (searchScope === 'all' || searchScope === 'views') {
          try {
            const views = await metadataApi.getViews(connectionId, db.name)
            for (const view of views) {
              const viewName = caseSensitive ? view.name : view.name.toLowerCase()
              if (viewName.includes(searchPattern)) {
                results.push({ type: 'view', name: view.name, database: db.name, comment: view.comment })
              }
            }
          } catch (error) {
            console.error('Failed to search views:', error)
          }
        }

        if (!isPostgreSQL && (searchScope === 'all' || searchScope === 'procedures')) {
          try {
            const procedures = await metadataApi.getProcedures(connectionId, db.name)
            for (const proc of procedures) {
              const procName = caseSensitive ? proc.ROUTINE_NAME : proc.ROUTINE_NAME.toLowerCase()
              if (procName.includes(searchPattern)) {
                results.push({ type: 'procedure', name: proc.ROUTINE_NAME, database: db.name })
              }
            }
          } catch (error) {
            console.error('Failed to search procedures:', error)
          }
        }

        if (searchScope === 'all' || searchScope === 'functions') {
          try {
            const functions = await metadataApi.getFunctions(connectionId, db.name)
            for (const func of functions) {
              const funcName = caseSensitive ? func.ROUTINE_NAME : func.ROUTINE_NAME.toLowerCase()
              if (funcName.includes(searchPattern)) {
                results.push({ type: 'function', name: func.ROUTINE_NAME, database: db.name })
              }
            }
          } catch (error) {
            console.error('Failed to search functions:', error)
          }
        }
      }

      setSearchResults(results)

      if (results.length === 0) {
        message.info(t('search.no_results_message'))
      } else {
        message.success(t('search.results_success', { n: results.length }))
      }
    } catch (error: unknown) {
      message.error(t('search.fail', { error: String(error) }))
    } finally {
      setSearching(false)
    }
  }

  function handleResultClick(item: SearchResult) {
    if (item.type === 'table' || item.type === 'view') {
      onViewData({ database: item.database, table: item.name })
    }
  }

  function handleViewData(item: SearchResult) {
    onViewData({ database: item.database, table: item.name })
    onClose()
  }

  async function handleCopyPath(item: SearchResult) {
    const path = item.table
      ? `${item.database}.${item.table}.${item.name}`
      : `${item.database}.${item.name}`
    await writeClipboardText(path)
    message.success(t('search.path_copied'))
  }

  const renderResultList = (typeKey: string) => (
    <List
      dataSource={getResultsByType(typeKey)}
      pagination={{ pageSize: 20 }}
      renderItem={(item) => (
        <List.Item
          actions={[
            <Button key="copy" type="link" size="small" onClick={() => void handleCopyPath(item)}>
              <CopyOutlined /> {t('common.copy_path')}
            </Button>,
            ...(item.type === 'table' ? [(
              <Button key="view" type="link" size="small" onClick={() => handleViewData(item)}>
                <TableOutlined /> {t('tree.view_data')}
              </Button>
            )] : []),
          ]}
        >
          <List.Item.Meta
            avatar={getIcon(item.type)}
            title={(
              <>
                <a onClick={() => handleResultClick(item)}>
                  <HighlightedText text={item.name} keyword={searchText} caseSensitive={caseSensitive} />
                </a>
                {item.database && <Tag color="blue" className={styles.resultTagDatabase}>{item.database}</Tag>}
                {item.table && <Tag color="green" className={styles.resultTagTable}>{item.table}</Tag>}
              </>
            )}
            description={(
              <div>
                {item.type && <span>{getTypeName(item.type)}</span>}
                {item.dataType && <span> • {t('search.type_prefix')}: {item.dataType}</span>}
                {item.comment && <span> • {item.comment}</span>}
              </div>
            )}
          />
        </List.Item>
      )}
    />
  )

  return (
    <Modal open={open} title={t('search.title')} width={1000} onCancel={onClose} footer={null}>
      <div className={styles.globalSearch}>
        <div className={`section-header ${styles.searchHeader}`}>
          <Input.Search
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t('search.placeholder')}
            size="large"
            onSearch={() => void handleSearch()}
            loading={searching}
            allowClear
            autoFocus
            enterButton={(
              <Button type="primary">
                <SearchOutlined /> {t('search.button')}
              </Button>
            )}
          />

          <div className={`${styles.searchFilters} ${styles.searchFiltersSpaced}`}>
            <Space>
              <Select
                value={searchScope}
                onChange={setSearchScope}
                className={styles.searchFilterSelect}
                placeholder={t('search.scope')}
                options={[
                  { value: 'all', label: t('search.scope_all') },
                  { value: 'tables', label: t('search.scope_tables') },
                  { value: 'columns', label: t('search.scope_columns') },
                  { value: 'views', label: t('search.scope_views') },
                  ...(isPostgreSQL ? [] : [{ value: 'procedures', label: t('search.scope_procedures') }]),
                  { value: 'functions', label: t('search.scope_functions') },
                ]}
              />
              <Select
                value={selectedDatabase}
                onChange={(v) => setSelectedDatabase(String(v ?? ''))}
                className={styles.searchFilterSelect}
                placeholder={t('search.select_database')}
                allowClear
                options={[
                  { value: '', label: t('search.all_databases') },
                  ...databases.map((db) => ({ value: db.name, label: db.name })),
                ]}
              />
              <Checkbox checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)}>
                {t('search.case_sensitive')}
              </Checkbox>
            </Space>
          </div>
        </div>

        {searchResults.length > 0 ? (
          <div className={styles.searchResults}>
            <div className={`text-subtle ${styles.resultsSummary}`}>
              {t('search.results_found')} <strong>{searchResults.length}</strong> {t('search.results_count')}
            </div>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={resultTypes.map((type) => ({
                key: type.key,
                label: `${type.label} (${getResultCount(type.key)})`,
                children: renderResultList(type.key),
              }))}
            />
          </div>
        ) : (!searching && searchText) ? (
          <Empty description={t('search.no_results')} />
        ) : null}
      </div>
    </Modal>
  )
}
