import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Form, Input, List, Modal as AntModal, Select, Space, Tag } from 'antd'
import { CopyOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import { message, Modal } from '../../ui/antd'
import { writeClipboardText } from '@/utils/clipboard'
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '@/utils/storageService'
import styles from './SqlSnippetsManager.module.css'

/**
 * SQL 片段管理器（对等 Vue 版 SqlSnippetsManager.vue；v-model:visible → open/onClose 受控）。
 * localStorage：`sql-snippets`（中划线命名，红线 1）。
 */

interface SqlSnippet {
  id: string
  title: string
  description?: string
  category?: string
  sql: string
  shortcut?: string
  createdAt: number
  updatedAt: number
}

interface SqlSnippetsManagerProps {
  open: boolean
  onClose: () => void
  onInsert: (sql: string) => void
}

function buildDefaultSnippets(): SqlSnippet[] {
  return [
    {
      id: '1',
      title: 'SELECT Basic Query',
      description: 'Basic SELECT query template',
      category: 'SELECT',
      sql: 'SELECT * FROM table_name\nWHERE condition\nORDER BY column_name\nLIMIT 100;',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: '2',
      title: 'INSERT Data',
      description: 'Insert single row',
      category: 'INSERT',
      sql: 'INSERT INTO table_name (column1, column2, column3)\nVALUES (value1, value2, value3);',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: '3',
      title: 'UPDATE Data',
      description: 'Update table data',
      category: 'UPDATE',
      sql: 'UPDATE table_name\nSET column1 = value1, column2 = value2\nWHERE condition;',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: '4',
      title: 'DELETE Data',
      description: 'Delete table data',
      category: 'DELETE',
      sql: 'DELETE FROM table_name\nWHERE condition;',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: '5',
      title: 'CREATE TABLE',
      description: 'Create table',
      category: 'DDL',
      sql: `CREATE TABLE table_name (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: '6',
      title: 'JOIN Query',
      description: 'Multi-table join query',
      category: 'SELECT',
      sql: `SELECT t1.*, t2.column_name
FROM table1 t1
LEFT JOIN table2 t2 ON t1.id = t2.foreign_id
WHERE t1.condition;`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: '7',
      title: 'GROUP BY',
      description: 'GROUP BY aggregate query',
      category: 'SELECT',
      sql: `SELECT column1, COUNT(*) as count, SUM(column2) as total
FROM table_name
GROUP BY column1
HAVING COUNT(*) > 1
ORDER BY count DESC;`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ]
}

export default function SqlSnippetsManager({ open, onClose, onInsert }: SqlSnippetsManagerProps) {
  const { t } = useTranslation()

  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('__all__')
  const [selectedSnippet, setSelectedSnippet] = useState<SqlSnippet | null>(null)
  const [snippets, setSnippets] = useState<SqlSnippet[]>([])

  const builtinCategories = [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DDL',
    t('dialog.snippets.category_common'),
    t('dialog.snippets.category_other'),
  ]

  const availableCategories = useMemo(() => {
    const categories = new Set<string>()
    builtinCategories.forEach((item) => categories.add(item))
    snippets.forEach((snippet) => {
      const category = snippet.category?.trim()
      if (category) categories.add(category)
    })
    return Array.from(categories).sort((a, b) => a.localeCompare(b))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snippets, t])

  const categoryOptions = availableCategories.map((category) => ({ label: category, value: category }))
  const categoryFilterOptions = [
    { label: t('dialog.snippets.all_categories'), value: '__all__' },
    ...categoryOptions,
  ]

  const filteredSnippets = useMemo(() => {
    const text = searchText.trim().toLowerCase()
    const category = categoryFilter

    return snippets
      .filter((snippet) => {
        if (category !== '__all__' && (snippet.category || '') !== category) {
          return false
        }
        if (!text) return true
        return snippet.title.toLowerCase().includes(text)
          || snippet.description?.toLowerCase().includes(text)
          || snippet.sql.toLowerCase().includes(text)
          || snippet.shortcut?.toLowerCase().includes(text)
          || snippet.category?.toLowerCase().includes(text)
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [snippets, searchText, categoryFilter])

  // 打开时加载（对等 watch(visible)）
  useEffect(() => {
    if (!open) return
    const saved = getStorageItem<SqlSnippet[]>(STORAGE_KEYS.CODE_SNIPPETS, [])
    const loaded = saved.length > 0 ? saved : buildDefaultSnippets()
    setSnippets(loaded)
    setCategoryFilter('__all__')
    setSelectedSnippet((prev) => {
      if (prev) return prev
      const sorted = [...loaded].sort((a, b) => b.updatedAt - a.updatedAt)
      return sorted.length > 0 ? { ...sorted[0] } : null
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function saveToStorage(next: SqlSnippet[]) {
    setStorageItem(STORAGE_KEYS.CODE_SNIPPETS, next)
  }

  function formatSnippetMeta(snippet: SqlSnippet) {
    return `${t('dialog.snippets.updated_at')}: ${new Date(snippet.updatedAt).toLocaleString()}`
  }

  function handleAddSnippet() {
    const newSnippet: SqlSnippet = {
      id: Date.now().toString(),
      title: t('dialog.snippets.new_snippet_title'),
      description: '',
      category: '',
      sql: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setSnippets((prev) => [newSnippet, ...prev])
    setSelectedSnippet(newSnippet)
    setCategoryFilter('__all__')
  }

  function selectSnippet(snippet: SqlSnippet) {
    setSelectedSnippet({ ...snippet })
  }

  function patchSelectedSnippet(patch: Partial<SqlSnippet>) {
    setSelectedSnippet((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  function saveSnippet() {
    if (!selectedSnippet) return
    const index = snippets.findIndex((s) => s.id === selectedSnippet.id)
    if (index !== -1) {
      const updated = { ...selectedSnippet, updatedAt: Date.now() }
      const next = [...snippets]
      next[index] = updated
      setSnippets(next)
      setSelectedSnippet(updated)
      saveToStorage(next)
      message.success(t('dialog.snippets.save_success'))
    }
  }

  function deleteSnippet(snippet: SqlSnippet) {
    Modal.confirm({
      title: t('dialog.snippets.delete_confirm_title'),
      content: t('dialog.snippets.delete_confirm_content', { title: snippet.title }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk() {
        setSnippets((prev) => {
          const next = prev.filter((s) => s.id !== snippet.id)
          saveToStorage(next)
          return next
        })
        setSelectedSnippet((prev) => (prev?.id === snippet.id ? null : prev))
        message.success(t('dialog.snippets.delete_success'))
      },
    })
  }

  async function copySnippet(snippet: SqlSnippet | null) {
    if (!snippet) return
    await writeClipboardText(snippet.sql)
    message.success(t('dialog.snippets.copy_success'))
  }

  function insertSnippet() {
    if (!selectedSnippet) return
    onInsert(selectedSnippet.sql)
    message.success(t('dialog.snippets.insert_success'))
    onClose()
  }

  return (
    <AntModal
      open={open}
      title={t('dialog.snippets.title')}
      width={900}
      onCancel={onClose}
      footer={null}
    >
      <div className={styles.snippetsManager}>
        <div className={`panel-toolbar ${styles.snippetsToolbar}`}>
          <Space>
            <Button icon={<PlusOutlined />} onClick={handleAddSnippet} type="primary">
              {t('dialog.snippets.new_snippet')}
            </Button>
            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              size="small"
              className={styles.categoryFilterSelect}
              options={categoryFilterOptions}
            />
            <Input.Search
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t('dialog.snippets.search_placeholder')}
              className={styles.snippetSearchInput}
            />
          </Space>
        </div>

        <div className={styles.snippetsContent}>
          <div className={styles.snippetsList}>
            <List
              dataSource={filteredSnippets}
              size="small"
              renderItem={(item) => (
                <List.Item
                  className={`interactive-row interactive-row--soft ${styles.snippetItem} ${selectedSnippet?.id === item.id ? styles.active : ''}`}
                  onClick={() => selectSnippet(item)}
                  onDoubleClick={() => void copySnippet(item)}
                  actions={[
                    <Button
                      key="copy"
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={(e) => { e.stopPropagation(); void copySnippet(item) }}
                      title={t('common.copy')}
                    />,
                    <Button
                      key="delete"
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => { e.stopPropagation(); deleteSnippet(item) }}
                      title={t('common.delete')}
                    />,
                  ]}
                >
                  <List.Item.Meta
                    title={(
                      <div className={styles.snippetTitle}>
                        {item.title}
                        {item.category && <Tag color="blue">{item.category}</Tag>}
                        {item.shortcut && <Tag>{item.shortcut}</Tag>}
                      </div>
                    )}
                    description={(
                      <>
                        <div className={styles.snippetDescription}>{item.description || t('dialog.snippets.no_description')}</div>
                        <div className={`text-caption ${styles.snippetMeta}`}>{formatSnippetMeta(item)}</div>
                      </>
                    )}
                  />
                </List.Item>
              )}
            />
          </div>

          {selectedSnippet && (
            <div className={styles.snippetEditor}>
              <Form labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
                <Form.Item label={t('dialog.snippets.snippet_title')}>
                  <Input
                    value={selectedSnippet.title}
                    onChange={(e) => patchSelectedSnippet({ title: e.target.value })}
                  />
                </Form.Item>
                <Form.Item label={t('dialog.snippets.category')}>
                  <Select
                    value={selectedSnippet.category ? [selectedSnippet.category] : []}
                    onChange={(vals: string[]) => patchSelectedSnippet({ category: vals[vals.length - 1] || '' })}
                    options={categoryOptions}
                    allowClear
                    placeholder={t('dialog.snippets.category_placeholder')}
                    mode="tags"
                    maxTagCount={1}
                  />
                </Form.Item>
                <Form.Item label={t('dialog.snippets.description')}>
                  <Input.TextArea
                    value={selectedSnippet.description}
                    onChange={(e) => patchSelectedSnippet({ description: e.target.value })}
                    rows={2}
                  />
                </Form.Item>
                <Form.Item label={t('dialog.snippets.sql_code')}>
                  <Input.TextArea
                    value={selectedSnippet.sql}
                    onChange={(e) => patchSelectedSnippet({ sql: e.target.value })}
                    rows={10}
                    className={styles.sqlInput}
                    placeholder={t('dialog.snippets.sql_placeholder')}
                  />
                </Form.Item>
                <Form.Item label={t('dialog.snippets.shortcut')}>
                  <Input
                    value={selectedSnippet.shortcut}
                    onChange={(e) => patchSelectedSnippet({ shortcut: e.target.value })}
                    placeholder={t('dialog.snippets.shortcut_placeholder')}
                  />
                </Form.Item>
              </Form>

              <div className={styles.snippetActions}>
                <Space>
                  <Button onClick={saveSnippet} type="primary" icon={<SaveOutlined />}>
                    {t('common.save')}
                  </Button>
                  <Button onClick={insertSnippet}>
                    {t('common.insert_to_editor')}
                  </Button>
                  <Button onClick={() => void copySnippet(selectedSnippet)} icon={<CopyOutlined />}>
                    {t('common.copy')}
                  </Button>
                </Space>
              </div>
            </div>
          )}
        </div>
      </div>
    </AntModal>
  )
}
