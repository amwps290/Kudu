import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Form, Input, Modal as AntModal, Radio, Switch } from 'antd'
import { FileOutlined } from '@ant-design/icons'
import { message, Modal } from '../../ui/antd'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { queryApi, utilsApi } from '@/api'
import styles from './ImportDataDialog.module.css'

/**
 * 还原数据库对话框（对等 Vue 版 RestoreDatabaseDialog.vue）。
 * SQL 文件逐句执行（分号切分，跳过注释/字符串内分号），可跳过错误继续。
 */

interface RestoreDatabaseDialogProps {
  open: boolean
  connectionId: string
  database: string
  onClose: () => void
  onRestored: () => void
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let inString = false
  let stringChar = ''
  let inComment = false

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]
    const nextChar = sql[i + 1]

    if (!inString && char === '-' && nextChar === '-') {
      inComment = true
      current += char
      continue
    }

    if (inComment && char === '\n') {
      inComment = false
      current += char
      continue
    }

    if (inComment) {
      current += char
      continue
    }

    if (!inString && (char === '"' || char === "'")) {
      inString = true
      stringChar = char
      current += char
      continue
    }

    if (inString && char === stringChar && sql[i - 1] !== '\\') {
      inString = false
      current += char
      continue
    }

    if (!inString && char === ';') {
      current += char
      statements.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) {
    statements.push(current.trim())
  }

  return statements
}

export default function RestoreDatabaseDialog({ open, connectionId, database, onClose, onRestored }: RestoreDatabaseDialogProps) {
  const { t } = useTranslation()

  const [restoring, setRestoring] = useState(false)
  const [filePath, setFilePath] = useState('')
  const [restoreMode, setRestoreMode] = useState('append')
  const [skipErrors, setSkipErrors] = useState(false)

  async function selectFile() {
    const path = await openFileDialog({
      filters: [{ name: t('dialog.restore_database.sql_file'), extensions: ['sql'] }],
      multiple: false,
    })
    if (path) setFilePath(path as string)
  }

  function resetAndClose() {
    setFilePath('')
    setRestoreMode('append')
    setSkipErrors(false)
    onClose()
  }

  async function doRestore() {
    setRestoring(true)
    try {
      const sqlContent = await utilsApi.readFile(filePath)
      const statements = splitSqlStatements(sqlContent)

      let successCount = 0
      let errorCount = 0

      for (const statement of statements) {
        const sql = statement.trim()
        if (!sql || sql.startsWith('--')) continue

        try {
          await queryApi.executeQuery(connectionId, sql, database)
          successCount++
        } catch (error: unknown) {
          errorCount++
          if (!skipErrors) {
            throw new Error(t('dialog.restore_database.sql_error', { error: String(error) }))
          }
          console.error('SQL error (skipped):', error)
        }
      }

      message.success(t('dialog.restore_database.success', { success: successCount, fail: errorCount }))
      onRestored()
      resetAndClose()
    } catch (error: unknown) {
      message.error(t('dialog.restore_database.fail', { error: String(error) }))
    } finally {
      setRestoring(false)
    }
  }

  async function handleRestore() {
    if (!filePath) {
      message.error(t('dialog.restore_database.file_required'))
      return
    }

    if (restoreMode === 'replace') {
      Modal.confirm({
        title: t('dialog.restore_database.confirm_title'),
        content: t('dialog.restore_database.confirm_content'),
        okText: t('common.ok'),
        okType: 'danger',
        cancelText: t('common.cancel'),
        onOk: async () => {
          await doRestore()
        },
      })
    } else {
      await doRestore()
    }
  }

  return (
    <AntModal
      open={open}
      title={t('dialog.restore_database.title', { database })}
      width="600px"
      onOk={() => void handleRestore()}
      onCancel={resetAndClose}
      confirmLoading={restoring}
    >
      <Form labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
        <Form.Item label={t('dialog.restore_database.backup_file')} required>
          <Input
            value={filePath}
            placeholder={t('dialog.restore_database.backup_file_placeholder')}
            readOnly
            onClick={() => void selectFile()}
            suffix={<FileOutlined className={styles.fileInputIcon} onClick={() => void selectFile()} />}
          />
        </Form.Item>

        <Form.Item label={t('dialog.restore_database.restore_mode')}>
          <Radio.Group value={restoreMode} onChange={(e) => setRestoreMode(e.target.value)}>
            <Radio value="append">{t('dialog.restore_database.mode_append')}</Radio>
            <Radio value="replace">{t('dialog.restore_database.mode_replace')}</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item label={t('dialog.restore_database.skip_errors')}>
          <Switch checked={skipErrors} onChange={setSkipErrors} />
          <span className={`text-caption ${styles.skipErrorsTip}`}>
            {t('dialog.restore_database.skip_errors_tip')}
          </span>
        </Form.Item>
      </Form>

      {restoreMode === 'replace' && (
        <Alert
          message={t('common.warning')}
          description={t('dialog.restore_database.replace_warning')}
          type="warning"
          showIcon
        />
      )}
    </AntModal>
  )
}
