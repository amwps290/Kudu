import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox, Form, Input, Modal, Select, Spin } from 'antd'
import { message } from '../../ui/antd'
import { dataApi, metadataApi } from '@/api'
import {
  getInsertFieldKind,
  hasColumnDefault,
  normalizeInsertValue,
  parseColumnDefaultValue,
} from '@/utils/tableColumns'
import type { ColumnInfo } from '@/types/database'
import styles from './InsertRecordDialog.module.css'

/** 表单新增记录对话框（对等 Vue 版 InsertRecordDialog.vue；v-model → open/onClose 受控） */

interface InsertRecordDialogProps {
  open: boolean
  connectionId: string
  database: string
  table: string
  schema?: string
  onClose: () => void
  onInserted: (payload: Record<string, unknown>) => void
}

export default function InsertRecordDialog({
  open, connectionId, database, table, schema, onClose, onInserted,
}: InsertRecordDialogProps) {
  const { t } = useTranslation()

  const [inserting, setInserting] = useState(false)
  const [loadingColumns, setLoadingColumns] = useState(false)
  const [columns, setColumns] = useState<ColumnInfo[]>([])
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [dirtyFields, setDirtyFields] = useState<Record<string, boolean>>({})
  const [nullFields, setNullFields] = useState<Record<string, boolean>>({})

  function getInitialValue(col: ColumnInfo) {
    const parsed = parseColumnDefaultValue(col.default_value)
    if (parsed === undefined) return undefined
    const normalized = normalizeInsertValue(col, parsed)
    if (getInsertFieldKind(col) === 'boolean') {
      return normalized === null ? null : normalized ? 1 : 0
    }
    return normalized
  }

  function getPlaceholder(col: ColumnInfo): string {
    if (col.is_auto_increment) return t('dialog.insert_record.auto_generated')
    if (col.default_value) return t('dialog.insert_record.default_value', { value: col.default_value })
    if (col.nullable) return t('dialog.insert_record.optional')
    return t('dialog.insert_record.required')
  }

  function getBooleanOptions(col: ColumnInfo) {
    const options: Array<{ label: string; value: string | number | null }> = [
      { label: t('dialog.insert_record.boolean_true'), value: 1 },
      { label: t('dialog.insert_record.boolean_false'), value: 0 },
    ]
    if (col.nullable) options.push({ label: t('data.set_null'), value: null })
    return options
  }

  function isFieldDisabled(col: ColumnInfo) {
    return col.is_auto_increment || Boolean(nullFields[col.name])
  }

  function setFieldValue(field: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setDirtyFields((prev) => ({ ...prev, [field]: true }))
  }

  function handleNullToggle(col: ColumnInfo, enabled: boolean) {
    setNullFields((prev) => ({ ...prev, [col.name]: enabled }))
    if (enabled) {
      setFormData((prev) => ({ ...prev, [col.name]: null }))
      setDirtyFields((prev) => ({ ...prev, [col.name]: true }))
      return
    }
    setFormData((prev) => ({ ...prev, [col.name]: getInitialValue(col) }))
    setDirtyFields((prev) => ({ ...prev, [col.name]: false }))
  }

  function resetFormState(cols: ColumnInfo[]) {
    const nextFormData: Record<string, any> = {}
    const nextDirty: Record<string, boolean> = {}
    const nextNull: Record<string, boolean> = {}
    for (const col of cols) {
      nextFormData[col.name] = getInitialValue(col)
      nextDirty[col.name] = false
      nextNull[col.name] = false
    }
    setFormData(nextFormData)
    setDirtyFields(nextDirty)
    setNullFields(nextNull)
  }

  // 打开时加载结构（对等 watch(visible)）
  useEffect(() => {
    if (!open || !table) return
    setLoadingColumns(true)
    void (async () => {
      try {
        const result = await metadataApi.getTableStructure({
          connectionId,
          table,
          schema: schema || null,
          database,
        })
        setColumns(result)
        resetFormState(result)
      } catch (error: unknown) {
        message.error(t('dialog.insert_record.load_fail', { error: String(error) }))
      } finally {
        setLoadingColumns(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function buildInsertPayload() {
    const data: Record<string, any> = {}
    const missingFields: string[] = []

    for (const col of columns) {
      if (col.is_auto_increment) continue

      const initialValue = getInitialValue(col)
      const touched = Boolean(dirtyFields[col.name])
      const hasDefaultValue = hasColumnDefault(col)

      if (nullFields[col.name]) {
        data[col.name] = null
        continue
      }

      const rawValue = formData[col.name]
      if (rawValue === undefined || rawValue === null) {
        if (rawValue === null && touched && col.nullable) {
          data[col.name] = null
        } else if (!col.nullable && !hasDefaultValue) {
          missingFields.push(col.name)
        }
        continue
      }

      if (!touched && hasDefaultValue && JSON.stringify(rawValue) === JSON.stringify(initialValue)) {
        continue
      }

      if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim()
        if (!trimmed) {
          const kind = getInsertFieldKind(col)
          if (kind === 'text' || kind === 'textarea') {
            if (touched) {
              data[col.name] = rawValue
            } else if (!col.nullable && !hasDefaultValue) {
              missingFields.push(col.name)
            }
            continue
          }
          if (!col.nullable && !hasDefaultValue) missingFields.push(col.name)
          continue
        }
      }

      data[col.name] = normalizeInsertValue(col, rawValue)
    }

    return { data, missingFields }
  }

  function handleCancel() {
    resetFormState(columns)
    onClose()
  }

  async function handleInsert() {
    let payload: Record<string, any> = {}
    try {
      const { data, missingFields } = buildInsertPayload()
      if (missingFields.length > 0) {
        message.error(t('dialog.insert_record.field_required', { field: missingFields.join(', ') }))
        return
      }
      if (Object.keys(data).length === 0) {
        message.error(t('data.insert_empty_error'))
        return
      }
      payload = data
    } catch (error: unknown) {
      const detail = String(error)
      if (detail.startsWith('Error: INVALID_JSON:')) {
        const field = detail.slice('Error: INVALID_JSON:'.length)
        message.error(t('dialog.insert_record.invalid_json', { field }))
        return
      }
      message.error(t('dialog.insert_record.fail', { error: detail }))
      return
    }

    setInserting(true)
    try {
      await dataApi.insertTableData({
        connectionId,
        database,
        table,
        schema,
        data: payload,
      })
      message.success(t('dialog.insert_record.success'))
      onInserted(payload)
      handleCancel()
    } catch (error: unknown) {
      message.error(t('dialog.insert_record.fail', { error: String(error) }))
    } finally {
      setInserting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('dialog.insert_record.title', { table })}
      width="700px"
      onOk={() => void handleInsert()}
      onCancel={handleCancel}
      confirmLoading={inserting}
    >
      <Spin spinning={loadingColumns}>
        <Form labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} className={styles.insertForm}>
          {columns.map((col) => {
            const kind = getInsertFieldKind(col)
            return (
              <Form.Item key={col.name} label={col.name} required={!col.nullable && !col.is_auto_increment}>
                <div className={styles.insertField}>
                  {kind === 'boolean' ? (
                    <Select
                      value={formData[col.name]}
                      options={getBooleanOptions(col)}
                      placeholder={getPlaceholder(col)}
                      disabled={isFieldDisabled(col)}
                      onChange={(v) => setFieldValue(col.name, v)}
                    />
                  ) : kind === 'textarea' || kind === 'json' ? (
                    <Input.TextArea
                      value={formData[col.name] ?? ''}
                      placeholder={getPlaceholder(col)}
                      disabled={isFieldDisabled(col)}
                      rows={kind === 'json' ? 5 : 3}
                      onChange={(e) => setFieldValue(col.name, e.target.value)}
                    />
                  ) : (
                    <Input
                      value={formData[col.name] ?? ''}
                      placeholder={getPlaceholder(col)}
                      disabled={isFieldDisabled(col)}
                      onChange={(e) => setFieldValue(col.name, e.target.value)}
                    />
                  )}
                </div>
                <div className={styles.insertFieldMeta}>
                  <span>{col.data_type}</span>
                  {hasColumnDefault(col) ? (
                    <span>{t('dialog.insert_record.default_value', { value: col.default_value })}</span>
                  ) : col.is_auto_increment ? (
                    <span>{t('dialog.insert_record.auto_generated')}</span>
                  ) : col.nullable ? (
                    <span>{t('dialog.insert_record.optional')}</span>
                  ) : (
                    <span>{t('dialog.insert_record.required')}</span>
                  )}
                </div>
                <div className={styles.insertFieldOptions}>
                  {col.nullable && !col.is_auto_increment && kind !== 'boolean' && (
                    <Checkbox
                      checked={Boolean(nullFields[col.name])}
                      onChange={(e) => handleNullToggle(col, e.target.checked)}
                    >
                      {t('data.set_null')}
                    </Checkbox>
                  )}
                </div>
                {col.comment && <div className={styles.insertFieldComment}>{col.comment}</div>}
              </Form.Item>
            )
          })}
        </Form>
      </Spin>
    </Modal>
  )
}
