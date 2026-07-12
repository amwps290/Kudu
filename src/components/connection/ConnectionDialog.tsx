import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Form, Input, InputNumber, Select, Space, Switch } from 'antd'
import { Modal, message } from '../../ui/antd'
import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog'
import { getErrorMessage } from '@/utils/errorHandler'
import { getDatabaseSupportProfile } from '@/utils/databaseSupport'
import { connectionApi } from '@/api'
import type { ConnectionConfig, DatabaseType } from '@/types/database'
import { useConnectionStore } from '../../stores/connectionStore'
import styles from './ConnectionDialog.module.css'

export interface ConnectionDialogProps {
  open: boolean
  editingConnection?: ConnectionConfig | null
  onClose: () => void
}

interface ConnectionFormValues {
  name: string
  db_type: DatabaseType
  host: string
  port: number
  username: string
  password: string
  database: string
  ssl: boolean
  connection_timeout: number
  read_only: boolean
}

const DEFAULT_FORM_VALUES: ConnectionFormValues = {
  name: '',
  db_type: 'mysql',
  host: 'localhost',
  port: 3306,
  username: 'root',
  password: '',
  database: '',
  ssl: false,
  connection_timeout: 10,
  read_only: false,
}

const DEFAULT_PORT_MAP: Record<string, number> = {
  mysql: 3306,
  postgresql: 5432,
  opengauss: 5432,
  gaussdb: 5432,
  mongodb: 27017,
  redis: 6379,
  sqlite: 0,
}

const CONNECTION_COLORS = [
  'var(--connection-color-1)',
  'var(--connection-color-2)',
  'var(--connection-color-3)',
  'var(--connection-color-4)',
  'var(--connection-color-5)',
  'var(--connection-color-6)',
  'var(--connection-color-7)',
  'var(--connection-color-8)',
]

const DB_TYPE_OPTIONS: Array<{ value: DatabaseType; displayName: string }> = [
  { value: 'mysql', displayName: 'MySQL' },
  { value: 'postgresql', displayName: 'PostgreSQL' },
  { value: 'opengauss', displayName: 'openGauss' },
  { value: 'gaussdb', displayName: 'GaussDB' },
  { value: 'sqlite', displayName: 'SQLite' },
  { value: 'mongodb', displayName: 'MongoDB' },
  { value: 'redis', displayName: 'Redis' },
]

export default function ConnectionDialog({ open, editingConnection, onClose }: ConnectionDialogProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm<ConnectionFormValues>()
  const [testing, setTesting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [color, setColor] = useState('')

  const dbType: DatabaseType = Form.useWatch('db_type', form) ?? 'mysql'
  const isEditing = Boolean(editingConnection)

  // 打开时填充/重置（对等 Vue 版 watch(editingConnection, immediate) + watch(visible)）
  useEffect(() => {
    if (!open) return
    if (editingConnection) {
      form.setFieldsValue({
        name: editingConnection.name || '',
        db_type: editingConnection.db_type || 'mysql',
        host: editingConnection.host || (editingConnection.db_type === 'sqlite' ? '' : 'localhost'),
        port: editingConnection.port || 3306,
        username: editingConnection.username || (editingConnection.db_type === 'sqlite' ? '' : 'root'),
        password: '', // 编辑时密码不回显
        database: editingConnection.database || '',
        ssl: editingConnection.ssl || false,
        connection_timeout: editingConnection.connection_timeout || 10,
        read_only: editingConnection.read_only ?? false,
      })
      setColor(editingConnection.color || '')
    } else {
      form.resetFields()
      setColor('')
    }
  }, [open, editingConnection, form])

  const getTypeOptionLabel = (type: DatabaseType, displayName: string) => {
    const profile = getDatabaseSupportProfile(type)
    return `${displayName} · ${t(`connection.support.levels.${profile.level}`)}`
  }

  // 新建时切换类型 → 填默认端口，SQLite 清空 host/username（对等 Vue 版 watch(db_type)）
  const handleDbTypeChange = (type: DatabaseType) => {
    if (isEditing) return
    form.setFieldsValue({
      port: DEFAULT_PORT_MAP[type] || 3306,
      ...(type === 'sqlite' ? { host: '', username: '' } : {}),
    })
  }

  const buildConfig = (values: ConnectionFormValues, id: string): ConnectionConfig => ({
    ...values,
    pool_size: editingConnection?.pool_size ?? 10,
    color: color || undefined,
    id,
    tags: isEditing ? editingConnection?.tags || [] : [],
    created_at: isEditing ? editingConnection?.created_at : Date.now(),
    updated_at: Date.now(),
  } as ConnectionConfig)

  const handleTest = async () => {
    try {
      const values = await form.validateFields()
      setTesting(true)
      const result = await useConnectionStore.getState().testConnection(buildConfig(values, ''))
      if (result) {
        void message.success(t('connection.test_success_ping', { ms: result.ping_time_ms }))
      }
    } catch (error: unknown) {
      const err = error as { errorFields?: unknown }
      if (err.errorFields) return
      Modal.error({ title: t('connection.test_fail'), content: getErrorMessage(error) || t('connection.fail'), width: 500 })
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const store = useConnectionStore.getState()
      const config = buildConfig(values, isEditing ? editingConnection!.id : window.crypto.randomUUID())

      if (isEditing) {
        await store.updateConnection(config, values.password)
      } else {
        await store.saveConnection(config, values.password)
      }

      void message.success(isEditing ? t('connection.update_success') : t('connection.save_success'))
      onClose()
      form.resetFields()
      setColor('')
    } catch (error: unknown) {
      const err = error as { errorFields?: unknown }
      if (err.errorFields) return
      void message.error(getErrorMessage(error) || t('common.fail'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    onClose()
    form.resetFields()
    setColor('')
  }

  const handleSelectFile = async () => {
    try {
      const selected = await openFileDialog({
        multiple: false,
        filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] }],
      })
      if (selected) form.setFieldsValue({ host: selected as string })
    } catch (error: unknown) {
      void message.error(`${t('common.fail')}: ${getErrorMessage(error)}`)
    }
  }

  const handleCreateFile = async () => {
    try {
      const path = await saveFileDialog({
        filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
      })
      if (path) {
        await connectionApi.createSqliteDatabase(path)
        form.setFieldsValue({ host: path })
        const fileName = path.split(/[\\/]/).pop()?.split('.')[0] || 'New SQLite'
        if (!form.getFieldValue('name')) form.setFieldsValue({ name: fileName })
        void message.success(t('connection.sqlite_created'))
      }
    } catch (error: unknown) {
      void message.error(`${t('common.fail')}: ${getErrorMessage(error)}`)
    }
  }

  return (
    <Modal
      open={open}
      title={isEditing ? t('connection.edit') : t('connection.new')}
      width={600}
      onCancel={handleCancel}
      forceRender
      footer={
        <Space>
          <Button onClick={handleCancel}>{t('common.cancel')}</Button>
          {dbType !== 'sqlite' && (
            <Button loading={testing} onClick={() => { void handleTest() }}>{t('connection.test')}</Button>
          )}
          <Button type="primary" loading={submitting} onClick={() => { void handleSubmit() }}>
            {isEditing ? t('common.update') : t('common.save')}
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        initialValues={DEFAULT_FORM_VALUES}
        labelCol={{ span: 6 }}
        wrapperCol={{ span: 18 }}
        className={styles.dialogForm}
      >
        <Form.Item
          label={t('connection.form.name')}
          name="name"
          rules={[{ required: true, message: t('connection.form.placeholders.name') }]}
        >
          <Input placeholder={t('connection.form.placeholders.name')} />
        </Form.Item>

        <Form.Item
          label={t('connection.form.type')}
          name="db_type"
          rules={[{ required: true, message: t('connection.form.placeholders.type') }]}
        >
          <Select
            placeholder={t('connection.form.placeholders.type')}
            onChange={(value) => handleDbTypeChange(value as DatabaseType)}
            options={DB_TYPE_OPTIONS.map(({ value, displayName }) => ({
              value,
              label: getTypeOptionLabel(value, displayName),
            }))}
          />
        </Form.Item>

        <Form.Item label={t('connection.form.color')}>
          <div className={styles.colorPicker}>
            {CONNECTION_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`${styles.colorSwatch} ${color === swatch ? styles.colorSwatchActive : ''}`}
                style={{ backgroundColor: swatch }}
                onClick={() => setColor(swatch)}
              />
            ))}
            <Button size="small" onClick={() => setColor('')}>{t('common.clear')}</Button>
          </div>
          <div className={`text-caption ${styles.colorPreview}`}>
            <span className={styles.previewDot} style={{ backgroundColor: color || 'var(--border-color-strong)' }} />
            <span>{color || t('connection.form.color_none')}</span>
          </div>
        </Form.Item>

        {dbType !== 'sqlite' && (
          <>
            <Form.Item
              label={t('connection.form.host')}
              name="host"
              rules={[{ required: true, message: t('connection.form.host') }]}
            >
              <Input placeholder={t('connection.form.placeholders.host')} />
            </Form.Item>

            <Form.Item
              label={t('connection.form.port')}
              name="port"
              rules={[{ required: true, message: t('connection.form.port') }]}
            >
              <InputNumber min={1} max={65535} className={styles.fullWidthInput} />
            </Form.Item>

            <Form.Item
              label={t('connection.form.user')}
              name="username"
              rules={
                dbType !== 'redis' && dbType !== 'mongodb'
                  ? [{ required: true, message: t('connection.form.user') }]
                  : []
              }
            >
              <Input
                placeholder={
                  dbType === 'redis' || dbType === 'mongodb'
                    ? t('connection.form.placeholders.user_optional')
                    : t('connection.form.placeholders.user')
                }
              />
            </Form.Item>

            <Form.Item label={t('connection.form.password')} name="password">
              <Input.Password
                placeholder={
                  dbType === 'redis'
                    ? t('connection.form.placeholders.password_optional')
                    : t('connection.form.placeholders.password')
                }
              />
            </Form.Item>
          </>
        )}

        {dbType === 'sqlite' && (
          <Form.Item label={t('connection.form.sqlite_file')} required>
            <Space.Compact className={styles.fullWidthInput}>
              <Form.Item
                name="host"
                noStyle
                rules={[{ required: true, message: t('connection.form.placeholders.sqlite_file') }]}
              >
                <Input placeholder={t('connection.form.placeholders.sqlite_file')} />
              </Form.Item>
              <Button onClick={() => { void handleSelectFile() }}>{t('connection.select_file')}</Button>
              <Button type="dashed" onClick={() => { void handleCreateFile() }}>{t('connection.create_file')}</Button>
            </Space.Compact>
          </Form.Item>
        )}

        {dbType !== 'sqlite' && (
          <Form.Item label={t('connection.form.database')} name="database">
            <Input
              placeholder={
                dbType === 'redis'
                  ? t('connection.form.placeholders.database_redis')
                  : t('connection.form.placeholders.database')
              }
            />
          </Form.Item>
        )}

        {dbType !== 'sqlite' && dbType !== 'redis' && (
          <Form.Item label={t('connection.form.ssl')} name="ssl" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}

        <Form.Item label={t('connection.form.timeout')} name="connection_timeout">
          <InputNumber min={1} max={300} className={styles.fullWidthInput} />
        </Form.Item>

        <Form.Item label={t('connection.form.protection')}>
          <div className={`info-panel ${styles.protectionItem}`}>
            <div className={styles.protectionCopy}>
              <div className={styles.protectionTitle}>{t('connection.form.read_only')}</div>
              <div className="help-text">{t('connection.form.read_only_help')}</div>
            </div>
            <Form.Item name="read_only" valuePropName="checked" noStyle>
              <Switch />
            </Form.Item>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  )
}
