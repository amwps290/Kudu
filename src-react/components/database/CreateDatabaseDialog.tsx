import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Form, Input, Modal, Select } from 'antd'
import { message } from '../../ui/antd'
import { queryApi } from '@/api'

/**
 * 新建数据库对话框（对等 Vue 版 CreateDatabaseDialog.vue）。
 * MySQL 带字符集/排序规则；PG 仅库名；SQLite 拦截提示（不支持 CREATE DATABASE）。
 */

interface CreateDatabaseDialogProps {
  open: boolean
  connectionId: string
  dbType?: string
  onClose: () => void
  onCreated: (databaseName: string) => void
}

export default function CreateDatabaseDialog({ open, connectionId, dbType, onClose, onCreated }: CreateDatabaseDialogProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const isMysql = dbType?.toLowerCase() === 'mysql'

  useEffect(() => {
    if (!open) {
      form.resetFields()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleCreate() {
    try {
      const values = await form.validateFields()
      setLoading(true)

      const type = dbType?.toLowerCase()
      if (type === 'sqlite') {
        message.error(t('dialog.create_database.sqlite_not_supported'))
        return
      }

      let sql = ''
      if (type === 'mysql') {
        sql = `CREATE DATABASE \`${values.databaseName}\`
        CHARACTER SET ${values.charset || 'utf8mb4'}
        COLLATE ${values.collation || 'utf8mb4_general_ci'}`
      } else if (type === 'postgresql') {
        sql = `CREATE DATABASE "${values.databaseName}"`
      } else {
        sql = `CREATE DATABASE \`${values.databaseName}\`
        CHARACTER SET ${values.charset || 'utf8mb4'}
        COLLATE ${values.collation || 'utf8mb4_general_ci'}`
      }

      await queryApi.executeQuery(connectionId, sql)
      message.success(t('dialog.create_database.success', { name: values.databaseName }))
      onCreated(values.databaseName)
      onClose()
      form.resetFields()
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return
      }
      message.error(t('dialog.create_database.fail', { error: String(error) }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('dialog.create_database.title')}
      onOk={() => void handleCreate()}
      onCancel={() => { onClose(); form.resetFields() }}
      confirmLoading={loading}
    >
      <Form
        form={form}
        labelCol={{ span: 6 }}
        wrapperCol={{ span: 18 }}
        initialValues={{ charset: 'utf8mb4', collation: 'utf8mb4_general_ci' }}
      >
        <Form.Item
          label={t('dialog.create_database.name')}
          name="databaseName"
          rules={[
            { required: true, message: t('dialog.create_database.name_required') },
            { pattern: /^[a-zA-Z0-9_]+$/, message: t('dialog.create_database.name_pattern') },
          ]}
        >
          <Input
            placeholder={t('dialog.create_database.name_placeholder')}
            onPressEnter={() => void handleCreate()}
          />
        </Form.Item>

        {isMysql && (
          <Form.Item label={t('dialog.create_database.charset')} name="charset">
            <Select
              options={[
                { value: 'utf8mb4', label: `utf8mb4 (${t('dialog.create_database.charset_recommend')})` },
                { value: 'utf8', label: 'utf8' },
                { value: 'latin1', label: 'latin1' },
                { value: 'gbk', label: 'gbk' },
              ]}
            />
          </Form.Item>
        )}

        {isMysql && (
          <Form.Item label={t('dialog.create_database.collation')} name="collation">
            <Select
              options={['utf8mb4_general_ci', 'utf8mb4_unicode_ci', 'utf8mb4_bin', 'utf8_general_ci', 'utf8_unicode_ci']
                .map((v) => ({ value: v, label: v }))}
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}
