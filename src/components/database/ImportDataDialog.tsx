import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Form, Input, Modal as AntModal, Radio, Switch } from 'antd'
import { FileOutlined } from '@ant-design/icons'
import { message, Modal } from '../../ui/antd'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { dataApi, metadataApi, queryApi, utilsApi } from '@/api'
import styles from './ImportDataDialog.module.css'

/**
 * 导入数据对话框（对等 Vue 版 ImportDataDialog.vue）。
 * CSV/JSON/SQL 三格式；insert/replace/truncate 三模式（replace 与 insert 无差别——
 * 已知死字段现状保留）；truncate 先确认再清空表。
 */

interface ImportDataDialogProps {
  open: boolean
  connectionId: string
  database: string
  table: string
  schema?: string
  onClose: () => void
  onImported: () => void
}

export default function ImportDataDialog({ open, connectionId, database, table, schema, onClose, onImported }: ImportDataDialogProps) {
  const { t } = useTranslation()

  const [importing, setImporting] = useState(false)
  const [importFormat, setImportFormat] = useState('csv')
  const [importMode, setImportMode] = useState('insert')
  const [filePath, setFilePath] = useState('')
  const [delimiter, setDelimiter] = useState(',')
  const [hasHeader, setHasHeader] = useState(true)

  function resetAndClose() {
    setImportFormat('csv')
    setImportMode('insert')
    setFilePath('')
    setDelimiter(',')
    setHasHeader(true)
    onClose()
  }

  async function selectFile() {
    const extensions: Record<string, string[]> = {
      csv: ['csv'],
      json: ['json'],
      sql: ['sql'],
    }
    const path = await openFileDialog({
      filters: [{ name: importFormat.toUpperCase(), extensions: extensions[importFormat] }],
      multiple: false,
    })
    if (path) {
      setFilePath(path as string)
    }
  }

  async function importFromCSV(content: string) {
    const lines = content.split('\n').filter((line) => line.trim())
    if (lines.length === 0) return

    let headers: string[] = []
    let startIndex = 0

    if (hasHeader) {
      headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''))
      startIndex = 1
    } else {
      const columns = await metadataApi.getTableStructure({
        connectionId,
        table,
        schema,
        database,
      })
      headers = columns.map((col) => col.name)
    }

    for (let i = startIndex; i < lines.length; i++) {
      const values = lines[i].split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ''))
      const data: Record<string, string> = {}
      headers.forEach((header, index) => {
        if (values[index] !== undefined && values[index] !== '') {
          data[header] = values[index]
        }
      })
      await dataApi.insertTableData({ connectionId, database, table, schema, data })
    }
  }

  async function importFromJSON(content: string) {
    const data = JSON.parse(content)
    const rows = Array.isArray(data) ? data : [data]
    for (const row of rows) {
      await dataApi.insertTableData({ connectionId, database, table, schema, data: row })
    }
  }

  async function importFromSQL(content: string) {
    await queryApi.executeQuery(connectionId, content, database)
  }

  async function doImport() {
    setImporting(true)
    try {
      if (importMode === 'truncate') {
        await dataApi.truncateTable({ connectionId, table, database, schema })
      }

      const fileContent = await utilsApi.readFile(filePath)

      if (importFormat === 'csv') {
        await importFromCSV(fileContent)
      } else if (importFormat === 'json') {
        await importFromJSON(fileContent)
      } else if (importFormat === 'sql') {
        await importFromSQL(fileContent)
      }

      message.success(t('dialog.import_data.success'))
      onImported()
      resetAndClose()
    } catch (error: unknown) {
      message.error(t('dialog.import_data.fail', { error: String(error) }))
    } finally {
      setImporting(false)
    }
  }

  async function handleImport() {
    if (!filePath) {
      message.error(t('dialog.import_data.file_required'))
      return
    }

    if (importMode === 'truncate') {
      Modal.confirm({
        title: t('dialog.import_data.confirm_truncate_title'),
        content: t('dialog.import_data.confirm_truncate_content'),
        okText: t('common.ok'),
        okType: 'danger',
        cancelText: t('common.cancel'),
        onOk: async () => {
          await doImport()
        },
      })
    } else {
      await doImport()
    }
  }

  return (
    <AntModal
      open={open}
      title={t('dialog.import_data.title', { table })}
      width="600px"
      onOk={() => void handleImport()}
      onCancel={resetAndClose}
      confirmLoading={importing}
    >
      <Form labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
        <Form.Item label={t('dialog.import_data.file_format')} required>
          <Radio.Group value={importFormat} onChange={(e) => setImportFormat(e.target.value)}>
            <Radio value="csv">CSV</Radio>
            <Radio value="json">JSON</Radio>
            <Radio value="sql">SQL</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item label={t('dialog.import_data.select_file')} required>
          <Input
            value={filePath}
            placeholder={t('dialog.import_data.select_file_placeholder')}
            readOnly
            onClick={() => void selectFile()}
            suffix={<FileOutlined className={styles.fileInputIcon} onClick={() => void selectFile()} />}
          />
        </Form.Item>

        <Form.Item label={t('dialog.import_data.import_mode')}>
          <Radio.Group value={importMode} onChange={(e) => setImportMode(e.target.value)}>
            <Radio value="insert">{t('dialog.import_data.mode_insert')}</Radio>
            <Radio value="replace">{t('dialog.import_data.mode_replace')}</Radio>
            <Radio value="truncate">{t('dialog.import_data.mode_truncate')}</Radio>
          </Radio.Group>
        </Form.Item>

        {importFormat === 'csv' && (
          <Form.Item label={t('dialog.import_data.delimiter')}>
            <Input value={delimiter} onChange={(e) => setDelimiter(e.target.value)} placeholder={t('dialog.import_data.delimiter_placeholder')} />
          </Form.Item>
        )}

        {importFormat === 'csv' && (
          <Form.Item label={t('dialog.import_data.has_header')}>
            <Switch checked={hasHeader} onChange={setHasHeader} />
          </Form.Item>
        )}
      </Form>

      {importMode === 'truncate' && (
        <Alert
          message={t('common.warning')}
          description={t('dialog.import_data.truncate_warning')}
          type="warning"
          showIcon
        />
      )}
    </AntModal>
  )
}
