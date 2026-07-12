import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Divider, Dropdown, Input, Popover, Select, Space, Tag, Tooltip } from 'antd'
import type { InputRef } from 'antd'
import type { MenuProps } from 'antd'
import {
  ApartmentOutlined, ClearOutlined, CodeOutlined, DatabaseOutlined, EllipsisOutlined,
  FileAddOutlined, FormatPainterOutlined, HistoryOutlined, PlayCircleFilled, PlusOutlined,
  SaveOutlined, SearchOutlined, StopOutlined, SyncOutlined, TableOutlined,
} from '@ant-design/icons'
import type { DatabaseInfo } from '@/types/database'
import styles from './SqlToolbar.module.css'

/**
 * SQL 工具栏（对等 Vue 版 components/layout/SqlToolbar.vue 的水平布局）。
 * Vue 版的 vertical 分支是"保留兼容"的死分支（唯一消费者 SqlEditor 不传 vertical），
 * React 版不迁移（记录于迁移文档）。
 */

export type SqlToolbarAction =
  | 'executeQuery' | 'explainQuery' | 'stopExecution'
  | 'handleSave' | 'saveAsFile' | 'formatSql' | 'clearEditor'
  | 'openHistory' | 'openSnippets' | 'refreshAutocomplete'
  | 'toggleResultPanel'

interface SqlToolbarProps {
  executing: boolean
  selectedDatabase: string
  databases: DatabaseInfo[]
  resultPanelVisible?: boolean
  showSearchPath?: boolean
  searchPath?: string
  onAction: (method: SqlToolbarAction) => void
  onDatabaseChange: (value: string) => void
  onSearchPathChange: (value: string) => void
}

export default function SqlToolbar({
  executing,
  selectedDatabase,
  databases,
  resultPanelVisible = false,
  showSearchPath = false,
  searchPath = '',
  onAction,
  onDatabaseChange,
  onSearchPathChange,
}: SqlToolbarProps) {
  const { t } = useTranslation()

  // ── search_path 编辑器 ──
  const [searchPathEditorOpen, setSearchPathEditorOpen] = useState(false)
  const [searchPathAdding, setSearchPathAdding] = useState(false)
  const [searchPathNewItem, setSearchPathNewItem] = useState('')
  const searchPathInputRef = useRef<InputRef>(null)

  const searchPathItems = searchPath
    ? searchPath.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const searchPathDisplay = searchPathItems.join(', ') || t('common.no_data')
  const searchPathSql = searchPathItems.length > 0
    ? `SET search_path TO ${searchPathItems.join(', ')};`
    : ''

  const startAddSearchPathItem = () => {
    setSearchPathAdding(true)
    requestAnimationFrame(() => searchPathInputRef.current?.focus())
  }

  const confirmAddSearchPathItem = () => {
    const val = searchPathNewItem.trim()
    setSearchPathNewItem('')
    setSearchPathAdding(false)
    if (!val) return
    if (searchPathItems.includes(val)) return
    onSearchPathChange([...searchPathItems, val].join(', '))
  }

  const removeSearchPathItem = (index: number) => {
    onSearchPathChange(searchPathItems.filter((_, i) => i !== index).join(', '))
  }

  const applySearchPath = () => {
    onSearchPathChange(searchPathItems.join(', '))
    setSearchPathEditorOpen(false)
  }

  const cancelSearchPathEdit = () => {
    onSearchPathChange(searchPath)
    setSearchPathEditorOpen(false)
  }

  const searchPathEditorContent = (
    <div className={styles.searchPathEditor}>
      <div className={styles.searchPathTags}>
        {searchPathItems.map((schema, i) => (
          <Tag key={i} closable onClose={() => removeSearchPathItem(i)} color="processing">
            {schema}
          </Tag>
        ))}
        {searchPathAdding && (
          <Input
            ref={searchPathInputRef}
            value={searchPathNewItem}
            onChange={(e) => setSearchPathNewItem(e.target.value)}
            size="small"
            className={styles.searchPathInput}
            placeholder={t('editor.search_path_schema_placeholder')}
            onPressEnter={confirmAddSearchPathItem}
            onBlur={confirmAddSearchPathItem}
          />
        )}
      </div>
      {!searchPathAdding && (
        <Button type="dashed" size="small" block icon={<PlusOutlined />} onClick={startAddSearchPathItem}>
          {t('editor.search_path_add')}
        </Button>
      )}
      {searchPathSql && (
        <div className={`code-block-compact ${styles.searchPathSqlPreview}`}>
          <code>{searchPathSql}</code>
        </div>
      )}
      <Space size={8} className={styles.searchPathActions}>
        <Button size="small" onClick={cancelSearchPathEdit}>{t('common.cancel')}</Button>
        <Button size="small" type="primary" onClick={applySearchPath}>{t('common.ok')}</Button>
      </Space>
    </div>
  )

  const overflowItems: MenuProps['items'] = [
    { key: 'saveAsFile', icon: <FileAddOutlined />, label: t('editor.save_as') },
    { key: 'clearEditor', icon: <ClearOutlined />, label: t('common.clear') },
    { key: 'refreshAutocomplete', icon: <SyncOutlined />, label: t('common.refresh') },
  ]

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
}
