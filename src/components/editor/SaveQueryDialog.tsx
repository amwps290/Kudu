import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Divider, Form, Input, Modal, Select } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { message } from '../../ui/antd'
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '@/utils/storageService'
import styles from './SaveQueryDialog.module.css'

/**
 * 保存查询对话框（对等 Vue 版 SaveQueryDialog.vue；v-model → open/onClose 受控）。
 * localStorage：saved_queries（上限 200）/ query_categories——key 与格式原样（红线 1）。
 */

export interface SavedQuery {
  id: string
  name: string
  sql: string
  category: string
  description: string
  createdAt: number
  updatedAt: number
}

interface SaveQueryDialogProps {
  open: boolean
  sql: string
  onClose: () => void
  onSaved?: (query: SavedQuery) => void
}

export default function SaveQueryDialog({ open, sql, onClose, onSaved }: SaveQueryDialogProps) {
  const { t } = useTranslation()

  const [saving, setSaving] = useState(false)
  const [queryName, setQueryName] = useState('')
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [description, setDescription] = useState('')
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [categories, setCategories] = useState<string[]>([])

  const categoryOptions = categories.map((cat) => ({ label: cat, value: cat }))
  const sqlPreview = sql.length > 200 ? `${sql.substring(0, 200)}...` : sql

  // 对话框打开时加载分类列表（对等 watch(visible)）
  useEffect(() => {
    if (open) {
      setCategories(getStorageItem<string[]>(STORAGE_KEYS.QUERY_CATEGORIES, [
        t('dialog.save_query.default_categories.common'),
        t('dialog.save_query.default_categories.analysis'),
        t('dialog.save_query.default_categories.reporting'),
      ]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleAddCategory() {
    if (!newCategory.trim()) {
      message.error(t('dialog.save_query.category_name_required'))
      return
    }
    if (categories.includes(newCategory)) {
      message.error(t('dialog.save_query.category_exists'))
      return
    }
    const next = [...categories, newCategory]
    setCategories(next)
    setStorageItem(STORAGE_KEYS.QUERY_CATEGORIES, next)
    setCategory(newCategory)
    setNewCategory('')
    setShowAddCategory(false)
    message.success(t('dialog.save_query.category_added'))
  }

  function handleCancel() {
    setQueryName('')
    setCategory(undefined)
    setDescription('')
    onClose()
  }

  function handleSave() {
    if (!queryName.trim()) {
      message.error(t('dialog.save_query.name_required'))
      return
    }

    setSaving(true)
    try {
      let queries: SavedQuery[] = getStorageItem<SavedQuery[]>(STORAGE_KEYS.SAVED_QUERIES, [])

      const query: SavedQuery = {
        id: Date.now().toString(),
        name: queryName,
        sql,
        category: category || '',
        description,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      queries.unshift(query)
      if (queries.length > 200) {
        queries = queries.slice(0, 200)
      }
      setStorageItem(STORAGE_KEYS.SAVED_QUERIES, queries)

      message.success(t('dialog.save_query.success'))
      onSaved?.(query)
      handleCancel()
    } catch (error: unknown) {
      message.error(t('dialog.save_query.fail', { error: String(error) }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('dialog.save_query.title')}
      width="500px"
      onOk={handleSave}
      onCancel={handleCancel}
      confirmLoading={saving}
    >
      <Form labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
        <Form.Item label={t('dialog.save_query.query_name')} required>
          <Input
            value={queryName}
            onChange={(e) => setQueryName(e.target.value)}
            placeholder={t('dialog.save_query.query_name_placeholder')}
          />
        </Form.Item>

        <Form.Item label={t('dialog.save_query.category')}>
          <Select
            value={category}
            onChange={(val) => setCategory(val)}
            placeholder={t('dialog.save_query.category_placeholder')}
            options={categoryOptions}
            showSearch
            allowClear
            popupRender={(menuNode) => (
              <div>
                <div>{menuNode}</div>
                <Divider className={styles.categoryDivider} />
                <div className={styles.categoryAction} onClick={() => setShowAddCategory(true)}>
                  <PlusOutlined /> {t('dialog.save_query.add_category')}
                </div>
              </div>
            )}
          />
        </Form.Item>

        <Form.Item label={t('dialog.save_query.description')}>
          <Input.TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('dialog.save_query.description_placeholder')}
            rows={3}
          />
        </Form.Item>

        <Form.Item label={t('dialog.save_query.sql_preview')}>
          <div className={`code-block-compact ${styles.sqlPreview}`}>
            {sqlPreview}
          </div>
        </Form.Item>
      </Form>

      <Modal
        open={showAddCategory}
        title={t('dialog.save_query.add_category_title')}
        width="400px"
        onOk={handleAddCategory}
        onCancel={() => setShowAddCategory(false)}
      >
        <Input
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          placeholder={t('dialog.save_query.category_input_placeholder')}
        />
      </Modal>
    </Modal>
  )
}
