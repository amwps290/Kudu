import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox, Form, Input, Modal as AntModal } from 'antd'
import { FolderOpenOutlined } from '@ant-design/icons'
import { message, Modal } from '../../ui/antd'
import { save } from '@tauri-apps/plugin-dialog'
import { downloadDir } from '@tauri-apps/api/path'
import { exportApi, metadataApi, queryApi, utilsApi } from '@/api'
import { useConnectionStore } from '../../stores/connectionStore'
import type { DatabaseType } from '@/types/database'
import styles from './ImportDataDialog.module.css'

/**
 * 备份数据库对话框（对等 Vue 版 BackupDatabaseDialog.vue）。
 * 前端逐表拼 SQL 备份（结构 DDL + 全量 INSERT + 视图定义），默认保存到下载目录。
 */

type BackupOptionValue = 'structure' | 'data' | 'views'

interface BackupDatabaseDialogProps {
  open: boolean
  connectionId: string
  database: string
  onClose: () => void
  onBacked: () => void
}

export default function BackupDatabaseDialog({ open, connectionId, database, onClose, onBacked }: BackupDatabaseDialogProps) {
  const { t } = useTranslation()

  const [backing, setBacking] = useState(false)
  const [backupOptions, setBackupOptions] = useState<BackupOptionValue[]>(['structure', 'data'])
  const [savePath, setSavePath] = useState('')

  const currentDbType: DatabaseType = useConnectionStore(
    (s) => s.connections.find((connection) => connection.id === connectionId)?.db_type || 'mysql',
  )

  const availableBackupOptions: Array<{ value: BackupOptionValue; label: string }> = [
    { value: 'structure', label: t('dialog.backup_database.structure') },
    { value: 'data', label: t('dialog.backup_database.table_data') },
    { value: 'views', label: t('dialog.backup_database.views') },
  ]

  function quoteIdentifier(name: string) {
    if (currentDbType === 'mysql') {
      return `\`${name.replace(/`/g, '``')}\``
    }
    return `"${name.replace(/"/g, '""')}"`
  }

  function qualifyObjectName(name: string, schema?: string) {
    if (currentDbType === 'postgresql' && schema) {
      return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`
    }
    return quoteIdentifier(name)
  }

  function stringifySqlValue(value: unknown) {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'number' || typeof value === 'bigint') return String(value)
    if (typeof value === 'boolean') {
      return currentDbType === 'mysql' ? (value ? '1' : '0') : (value ? 'TRUE' : 'FALSE')
    }
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`
    }
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  }

  function getDefaultFileName(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    return `${database}_backup_${timestamp}.sql`
  }

  // 打开时预填下载目录路径（对等 watch(modelValue)）
  useEffect(() => {
    if (!open || savePath) return
    void (async () => {
      try {
        const downloadsPath = await downloadDir()
        setSavePath(`${downloadsPath}\\${getDefaultFileName()}`)
      } catch (error) {
        console.error('Failed to get download dir:', error)
        setSavePath(getDefaultFileName())
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function selectSavePath() {
    const path = await save({
      defaultPath: getDefaultFileName(),
      filters: [{ name: t('dialog.backup_database.sql_file'), extensions: ['sql'] }],
    })
    if (path) setSavePath(path)
  }

  function resetAndClose() {
    setBackupOptions(['structure', 'data'])
    setSavePath('')
    onClose()
  }

  async function handleBackup() {
    if (!savePath) {
      message.error(t('dialog.backup_database.save_path_required'))
      return
    }
    if (backupOptions.length === 0) {
      message.error(t('dialog.backup_database.content_required'))
      return
    }

    setBacking(true)
    try {
      let backupSql = `-- ${t('dialog.backup_database.comment_backup')}: ${database}\n`
      backupSql += `-- ${t('dialog.backup_database.comment_time')}: ${new Date().toLocaleString()}\n\n`

      if (backupOptions.includes('structure') || backupOptions.includes('data')) {
        const tables = await metadataApi.getTables(connectionId, database)

        for (const table of tables) {
          if (backupOptions.includes('structure')) {
            const ddl = await exportApi.tableDdl(connectionId, database, table.name, table.schema)
            backupSql += `\n-- ${t('dialog.backup_database.comment_structure')}: ${table.name}\n`
            backupSql += `DROP TABLE IF EXISTS ${qualifyObjectName(table.name, table.schema)};\n`
            backupSql += `${ddl};\n\n`
          }

          if (backupOptions.includes('data')) {
            const qualifiedTableName = qualifyObjectName(table.name, table.schema)
            const result = await queryApi.executeQuery(connectionId, `SELECT * FROM ${qualifiedTableName}`, database)
            const resultData = result[0]
            if (resultData && resultData.rows && resultData.rows.length > 0) {
              backupSql += `-- ${t('dialog.backup_database.comment_data')}: ${table.name}\n`
              for (const row of resultData.rows as Array<Record<string, unknown>>) {
                const columns = Object.keys(row)
                const values = columns.map((col) => stringifySqlValue(row[col]))
                const quotedColumns = columns.map((col) => quoteIdentifier(col)).join(', ')
                backupSql += `INSERT INTO ${qualifiedTableName} (${quotedColumns}) VALUES (${values.join(', ')});\n`
              }
              backupSql += '\n'
            }
          }
        }
      }

      if (backupOptions.includes('views')) {
        const views = await metadataApi.getViews(connectionId, database)
        for (const view of views) {
          const definition = await metadataApi.getViewDefinition({
            connectionId,
            database,
            view: view.name,
            schema: view.schema,
          })
          backupSql += `\n-- ${t('dialog.backup_database.comment_view')}: ${view.name}\n`
          backupSql += `DROP VIEW IF EXISTS ${qualifyObjectName(view.name, view.schema)};\n`
          backupSql += `${definition};\n\n`
        }
      }

      await utilsApi.writeFile(savePath, backupSql)

      const summary = availableBackupOptions
        .filter((option) => backupOptions.includes(option.value))
        .map((option) => option.label)
        .join('、')

      Modal.success({
        title: t('dialog.backup_database.success_title'),
        content: t('dialog.backup_database.success_content', { database, path: savePath, summary }),
        okText: t('common.ok'),
      })

      onBacked()
      resetAndClose()
    } catch (error: unknown) {
      message.error(t('dialog.backup_database.fail', { error: String(error) }))
    } finally {
      setBacking(false)
    }
  }

  return (
    <AntModal
      open={open}
      title={t('dialog.backup_database.title', { database })}
      width="600px"
      onOk={() => void handleBackup()}
      onCancel={resetAndClose}
      confirmLoading={backing}
    >
      <Form labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
        <Form.Item label={t('dialog.backup_database.content')}>
          <Checkbox.Group
            value={backupOptions}
            onChange={(vals) => setBackupOptions(vals as BackupOptionValue[])}
            options={availableBackupOptions}
          />
        </Form.Item>

        <Form.Item label={t('dialog.backup_database.save_path')} required>
          <Input
            value={savePath}
            placeholder={t('dialog.backup_database.save_path_placeholder')}
            readOnly
            onClick={() => void selectSavePath()}
            suffix={<FolderOpenOutlined className={styles.fileInputIcon} onClick={() => void selectSavePath()} />}
          />
        </Form.Item>
      </Form>
    </AntModal>
  )
}
