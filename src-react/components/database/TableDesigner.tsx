import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Divider, Form, Input, Modal as AntModal, Select, Space, Spin, Tabs, Tag } from 'antd'
import { CopyOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { message, Modal } from '../../ui/antd'
import { metadataApi, queryApi } from '@/api'
import { withErrorHandler } from '@/utils/errorHandler'
import { writeClipboardText } from '@/utils/clipboard'
import { useConnectionStore } from '../../stores/connectionStore'
import { useMonacoEditor } from '../../hooks/useMonacoEditor'
import TableDesignerColumns from './TableDesignerColumns'
import TableDesignerIndexes from './TableDesignerIndexes'
import TableDesignerForeignKeys from './TableDesignerForeignKeys'
import type { DesignerChange, DesignerColumn, DesignerForeignKey, DesignerIndex } from './designerTypes'
import styles from './TableDesigner.module.css'

/**
 * 表设计器（对等 Vue 版 TableDesigner.vue）。
 * pendingDeletions 队列、collectChanges 8 种 change 类型、buildPreviewSql 方言分支、
 * MySQL 列重排（collectReorderChanges 的 identity 追踪）——逐行平移。
 * 预览是前端拼串、执行走 alterTableStructure 参数化命令（已知问题 2 现状保留）。
 */

interface TableDesignerProps {
  connectionId: string
  database: string
  table: string
  schema?: string
  readOnly?: boolean
  initialTab?: 'columns' | 'indexes' | 'foreign_keys' | 'ddl'
  initialAction?: 'add_column' | 'add_index' | 'add_foreign_key'
}

/** DDL 只读面板（独立组件：Tabs 惰性渲染下首次激活时才挂载 Monaco） */
function DesignerDdlPane({ ddl, loading, onCopy }: { ddl: string; loading: boolean; onCopy: () => void }) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const { ready, setValue, editorRef } = useMonacoEditor(containerRef, {
    value: '-- Loading DDL...\n',
    language: 'sql',
    readOnly: true,
  })

  useEffect(() => {
    if (ready) {
      setValue(ddl)
      requestAnimationFrame(() => editorRef.current?.layout())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ddl])

  return (
    <>
      <div className={styles.ddlContainer} ref={containerRef}>
        {loading && <Spin className={styles.ddlSpin} />}
      </div>
      <div className={styles.ddlActions}>
        <Button icon={<CopyOutlined />} onClick={onCopy} size="small">
          {t('data.copy_content')}
        </Button>
      </div>
    </>
  )
}

export default function TableDesigner({
  connectionId, database, table, schema, readOnly, initialTab, initialAction,
}: TableDesignerProps) {
  const { t } = useTranslation()

  const currentConnection = useConnectionStore((s) => s.connections.find((c) => c.id === connectionId) || null)
  const effectiveReadOnly = Boolean(readOnly) || Boolean(currentConnection?.read_only)
  const dbType = currentConnection?.db_type || 'mysql'

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<string>(initialTab || 'columns')
  const [loadingDDL, setLoadingDDL] = useState(false)
  const [ddlSql, setDdlSql] = useState('')
  const [showAddIndexDialog, setShowAddIndexDialog] = useState(false)
  const [showAddForeignKeyDialog, setShowAddForeignKeyDialog] = useState(false)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [previewSql, setPreviewSql] = useState('')
  const previewChangesRef = useRef<DesignerChange[]>([])
  const [previewCount, setPreviewCount] = useState(0)

  const [tableColumns, setTableColumns] = useState<DesignerColumn[]>([])
  const [tableIndexes, setTableIndexes] = useState<DesignerIndex[]>([])
  const [tableForeignKeys, setTableForeignKeys] = useState<DesignerForeignKey[]>([])

  const tableColumnsRef = useRef<DesignerColumn[]>([])
  tableColumnsRef.current = tableColumns
  const originalColumnOrderRef = useRef<string[]>([])
  const nextCreatedColumnOrderRef = useRef(0)
  const pendingDeletionsRef = useRef({ columns: [] as string[], indexes: [] as string[], foreignKeys: [] as string[] })
  const lastHandledActionRef = useRef('')
  const ddlLoadedRef = useRef(false)

  const [newIndex, setNewIndex] = useState({ name: '', type: 'INDEX', columns: [] as string[] })
  const [newForeignKey, setNewForeignKey] = useState({
    name: '', column: '', refTable: '', refColumn: '', onDelete: 'CASCADE', onUpdate: 'CASCADE',
  })

  const latestRef = useRef({ connectionId, database, table, schema, dbType, effectiveReadOnly })
  latestRef.current = { connectionId, database, table, schema, dbType, effectiveReadOnly }

  function warnReadOnly() {
    message.warning(t('designer.read_only_blocked'))
  }

  function resetPreviewState() {
    setShowPreviewDialog(false)
    setPreviewSql('')
    previewChangesRef.current = []
    setPreviewCount(0)
  }

  // ── SQL 构建（照抄 Vue 版方言分支）──

  function quoteIdent(name: string) {
    return latestRef.current.dbType === 'mysql' ? `\`${name}\`` : `"${name.replace(/"/g, '""')}"`
  }

  function tableIdentifier() {
    const { dbType: type, schema: propSchema, database: propDatabase, table: propTable } = latestRef.current
    if (type === 'postgresql' || type === 'opengauss' || type === 'gaussdb') {
      return `${quoteIdent(propSchema || 'public')}.${quoteIdent(propTable)}`
    }
    if (type === 'mysql' && propDatabase) {
      return `${quoteIdent(propDatabase)}.${quoteIdent(propTable)}`
    }
    return quoteIdent(propTable)
  }

  function quoteLiteral(value: string | null | undefined) {
    if (value === null || value === undefined || value === '') return 'NULL'
    return `'${String(value).replace(/'/g, "''")}'`
  }

  function buildColumnDataType(column: DesignerColumn) {
    if (['CHAR', 'VARCHAR'].includes(column.data_type)) {
      return column.length ? `${column.data_type}(${column.length})` : column.data_type
    }
    if (column.data_type === 'DECIMAL') {
      if (column.numeric_precision && column.numeric_scale !== undefined && column.numeric_scale !== null) {
        return `${column.data_type}(${column.numeric_precision},${column.numeric_scale})`
      }
      if (column.length) {
        return `${column.data_type}(${column.length})`
      }
    }
    return column.data_type
  }

  function buildColumnDefinition(column: DesignerColumn) {
    const parts = [`${quoteIdent(column.name)} ${buildColumnDataType(column)}`]
    if (!column.nullable) parts.push('NOT NULL')
    if (column.default_value !== undefined && column.default_value !== null && column.default_value !== '') {
      parts.push(`DEFAULT ${quoteLiteral(column.default_value)}`)
    }
    if (latestRef.current.dbType === 'mysql' && column.is_auto_increment) {
      parts.push('AUTO_INCREMENT')
    }
    return parts.join(' ')
  }

  function buildColumnPayload(column: DesignerColumn) {
    return {
      name: column.name,
      data_type: column.data_type,
      length: column.length ? Number(column.length) : undefined,
      nullable: column.nullable,
      default_value: column.default_value || null,
      is_primary_key: column.is_primary_key,
      is_auto_increment: column.is_auto_increment,
      comment: column.comment || null,
      character_maximum_length: column.length ? Number(column.length) : null,
      numeric_precision: column.numeric_precision ?? null,
      numeric_scale: column.numeric_scale ?? null,
    }
  }

  function getColumnIdentity(column: DesignerColumn) {
    return column._isNew ? `new:${column._createdOrder ?? column.name}` : `old:${column._originalName || column.name}`
  }

  function collectReorderChanges(): DesignerChange[] {
    if (latestRef.current.dbType !== 'mysql') return []

    const currentColumns = tableColumnsRef.current.slice()
    const defaultColumns = [
      ...currentColumns
        .filter((column) => !column._isNew)
        .sort((left, right) => originalColumnOrderRef.current.indexOf(left._originalName || left.name) - originalColumnOrderRef.current.indexOf(right._originalName || right.name)),
      ...currentColumns
        .filter((column) => column._isNew)
        .sort((left, right) => (left._createdOrder ?? 0) - (right._createdOrder ?? 0)),
    ]

    const workingOrder = defaultColumns.slice()
    const changes: DesignerChange[] = []

    for (let targetIndex = 0; targetIndex < currentColumns.length; targetIndex += 1) {
      const targetColumn = currentColumns[targetIndex]
      const targetIdentity = getColumnIdentity(targetColumn)
      const currentIndex = workingOrder.findIndex((column) => getColumnIdentity(column) === targetIdentity)

      if (currentIndex === -1 || currentIndex === targetIndex) continue

      const [movedColumn] = workingOrder.splice(currentIndex, 1)
      workingOrder.splice(targetIndex, 0, movedColumn)

      changes.push({
        type: 'reorder_column',
        data: {
          column: buildColumnPayload(targetColumn),
          after_column: targetIndex === 0 ? null : currentColumns[targetIndex - 1].name,
        },
      })
    }

    return changes
  }

  function collectChanges(): DesignerChange[] {
    const changes: DesignerChange[] = []

    for (const col of tableColumnsRef.current) {
      if (!col._modified && !col._isNew) continue
      const columnInfo = buildColumnPayload(col)
      if (col._isNew) {
        changes.push({ type: 'add_column', data: columnInfo })
      } else {
        changes.push({ type: 'modify_column', data: { old_name: col._originalName || col.name, new_column: columnInfo } })
      }
    }

    pendingDeletionsRef.current.columns.forEach((name) => changes.push({ type: 'drop_column', data: name }))
    pendingDeletionsRef.current.indexes.forEach((name) => changes.push({ type: 'drop_index', data: name }))
    pendingDeletionsRef.current.foreignKeys.forEach((name) => changes.push({ type: 'drop_foreign_key', data: name }))

    for (const idx of tableIndexes) {
      if (idx._isNew) changes.push({ type: 'add_index', data: { ...idx, _isNew: undefined } })
    }
    for (const fk of tableForeignKeys) {
      if (fk._isNew) changes.push({ type: 'add_foreign_key', data: { ...fk, _isNew: undefined } })
    }

    changes.push(...collectReorderChanges())
    return changes
  }

  function buildPreviewSql(changes: DesignerChange[]) {
    const statements: string[] = []
    const targetTable = tableIdentifier()
    const type = latestRef.current.dbType

    for (const change of changes) {
      switch (change.type) {
        case 'add_column': {
          statements.push(`ALTER TABLE ${targetTable} ADD COLUMN ${buildColumnDefinition(change.data)};`)
          break
        }
        case 'modify_column': {
          const oldName = change.data.old_name
          const column = change.data.new_column
          if (type === 'sqlite') {
            statements.push(`-- SQLite 暂不支持在线修改列: ${oldName} -> ${column.name}`)
            break
          }
          if (type === 'postgresql') {
            if (oldName !== column.name) {
              statements.push(`ALTER TABLE ${targetTable} RENAME COLUMN ${quoteIdent(oldName)} TO ${quoteIdent(column.name)};`)
            }
            statements.push(`ALTER TABLE ${targetTable} ALTER COLUMN ${quoteIdent(column.name)} TYPE ${buildColumnDataType(column)};`)
            statements.push(`ALTER TABLE ${targetTable} ALTER COLUMN ${quoteIdent(column.name)} ${column.nullable ? 'DROP' : 'SET'} NOT NULL;`)
            break
          }
          const operation = oldName !== column.name
            ? `CHANGE COLUMN ${quoteIdent(oldName)} ${buildColumnDefinition(column)}`
            : `MODIFY COLUMN ${buildColumnDefinition(column)}`
          statements.push(`ALTER TABLE ${targetTable} ${operation};`)
          break
        }
        case 'drop_column':
          statements.push(type === 'sqlite'
            ? `-- SQLite 暂不支持在线删除列: ${change.data}`
            : `ALTER TABLE ${targetTable} DROP COLUMN ${quoteIdent(change.data)};`)
          break
        case 'reorder_column': {
          if (type !== 'mysql') {
            statements.push(`-- ${type} 暂不支持调整字段顺序: ${change.data.column.name}`)
            break
          }
          const column = change.data.column
          const positionSql = change.data.after_column
            ? `AFTER ${quoteIdent(change.data.after_column)}`
            : 'FIRST'
          statements.push(`ALTER TABLE ${targetTable} MODIFY COLUMN ${buildColumnDefinition(column)} ${positionSql};`)
          break
        }
        case 'add_index': {
          const idx = change.data
          const columnsSql = idx.columns.map((name: string) => quoteIdent(name)).join(', ')
          if (type === 'postgresql') {
            statements.push(`CREATE ${idx.is_unique ? 'UNIQUE ' : ''}INDEX ${quoteIdent(idx.name)} ON ${targetTable} (${columnsSql});`)
          } else {
            statements.push(`ALTER TABLE ${targetTable} ADD ${idx.is_unique ? 'UNIQUE ' : ''}INDEX ${quoteIdent(idx.name)} (${columnsSql});`)
          }
          break
        }
        case 'drop_index':
          if (type === 'postgresql') {
            statements.push(`DROP INDEX ${latestRef.current.schema ? `${quoteIdent(latestRef.current.schema)}.` : ''}${quoteIdent(change.data)};`)
          } else if (type === 'sqlite') {
            statements.push(`-- SQLite 暂不支持在线删除索引: ${change.data}`)
          } else {
            statements.push(`ALTER TABLE ${targetTable} DROP INDEX ${quoteIdent(change.data)};`)
          }
          break
        case 'add_foreign_key': {
          const fk = change.data
          statements.push(
            `ALTER TABLE ${targetTable} ADD CONSTRAINT ${quoteIdent(fk.name)} FOREIGN KEY (${quoteIdent(fk.column_name)}) REFERENCES ${quoteIdent(fk.referenced_table_name)} (${quoteIdent(fk.referenced_column_name)}) ON UPDATE ${fk.update_rule || 'NO ACTION'} ON DELETE ${fk.delete_rule || 'NO ACTION'};`,
          )
          break
        }
        case 'drop_foreign_key':
          if (type === 'postgresql') {
            statements.push(`ALTER TABLE ${targetTable} DROP CONSTRAINT ${quoteIdent(change.data)};`)
          } else if (type === 'sqlite') {
            statements.push(`-- SQLite 暂不支持在线删除外键: ${change.data}`)
          } else {
            statements.push(`ALTER TABLE ${targetTable} DROP FOREIGN KEY ${quoteIdent(change.data)};`)
          }
          break
        default:
          statements.push(`-- Unsupported change: ${JSON.stringify(change)}`)
          break
      }
    }

    return statements.join('\n\n')
  }

  // ── 结构加载 ──

  function extractLength(dataType: string): number | undefined {
    const match = dataType.match(/\((\d+)\)/)
    return match ? parseInt(match[1]) : undefined
  }

  function extractBaseType(dataType: string): string {
    return dataType.replace(/\(.*\)/, '').toUpperCase()
  }

  async function loadStructure() {
    return withErrorHandler(async () => {
      setLoading(true)
      resetPreviewState()
      const params = {
        connectionId: latestRef.current.connectionId,
        table: latestRef.current.table,
        schema: latestRef.current.schema || null,
        database: latestRef.current.database,
      }

      const [columns, indexes, foreignKeys] = await Promise.all([
        metadataApi.getTableStructure(params),
        metadataApi.getTableIndexes(params),
        metadataApi.getTableForeignKeys(params),
      ])

      const designerColumns = columns.map((col) => ({
        ...col,
        length: col.character_maximum_length ? Number(col.character_maximum_length) : extractLength(col.data_type),
        data_type: extractBaseType(col.data_type),
        _modified: false, _isNew: false, _originalName: col.name,
      }))
      setTableColumns(designerColumns)
      tableColumnsRef.current = designerColumns
      originalColumnOrderRef.current = columns.map((col) => col.name)
      nextCreatedColumnOrderRef.current = 0

      setTableIndexes(indexes.map((idx) => ({ ...idx, _isNew: false })))
      setTableForeignKeys(foreignKeys.map((fk) => ({ ...fk, _isNew: false })))

      pendingDeletionsRef.current = { columns: [], indexes: [], foreignKeys: [] }

      if (ddlLoadedRef.current) void loadDDL()
    }, {
      messagePrefix: t('designer.load_fail'),
      showMessage: true,
    }).finally(() => {
      setLoading(false)
    })
  }

  async function loadDDL() {
    setLoadingDDL(true)
    ddlLoadedRef.current = true
    try {
      const result = await metadataApi.getCreateTableDdl({
        connectionId: latestRef.current.connectionId,
        database: latestRef.current.database,
        table: latestRef.current.table,
        schema: latestRef.current.schema,
      })
      setDdlSql(result.replace(/\\n/g, '\n'))
    } catch (error: unknown) {
      message.error(`${t('designer.ddl')} ${t('common.fail')}: ${error}`)
      setDdlSql(`-- Error: ${error}`)
    } finally {
      setLoadingDDL(false)
    }
  }

  async function copyDDL() {
    await writeClipboardText(ddlSql)
    message.success(t('common.copy') + ' ' + t('common.ok'))
  }

  // ── 编辑操作 ──

  function patchColumn(index: number, patch: Partial<DesignerColumn>) {
    setTableColumns((prev) => prev.map((col, i) => (i === index ? { ...col, ...patch } : col)))
  }

  function addColumn() {
    if (latestRef.current.effectiveReadOnly) {
      warnReadOnly()
      return
    }
    setTableColumns((prev) => [...prev, {
      name: `column_${prev.length + 1}`,
      data_type: 'VARCHAR', length: 255, nullable: true,
      is_primary_key: false, is_auto_increment: false,
      default_value: undefined, comment: '', _modified: true, _isNew: true,
      _createdOrder: nextCreatedColumnOrderRef.current++,
    } as DesignerColumn])
  }

  function removeColumn(index: number) {
    if (latestRef.current.effectiveReadOnly) {
      warnReadOnly()
      return
    }
    const col = tableColumnsRef.current[index]
    Modal.confirm({
      title: t('common.delete'),
      content: `${t('common.delete')} "${col.name}"?`,
      okText: t('common.delete'), okType: 'danger',
      onOk() {
        if (!col._isNew) {
          pendingDeletionsRef.current.columns.push(col._originalName || col.name)
        }
        setTableColumns((prev) => prev.filter((_, i) => i !== index))
      },
    })
  }

  function moveColumn(index: number, direction: number) {
    if (latestRef.current.effectiveReadOnly) {
      warnReadOnly()
      return
    }
    setTableColumns((prev) => {
      const newIdx = index + direction
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      const temp = { ...next[index], _modified: true }
      next[index] = { ...next[newIdx], _modified: true }
      next[newIdx] = temp
      return next
    })
  }

  function addIndex() {
    if (latestRef.current.effectiveReadOnly) {
      warnReadOnly()
      return
    }
    setNewIndex({ name: '', type: 'INDEX', columns: [] })
    setShowAddIndexDialog(true)
  }

  function handleAddIndex() {
    if (latestRef.current.effectiveReadOnly) {
      warnReadOnly()
      setShowAddIndexDialog(false)
      return
    }
    if (!newIndex.name || newIndex.columns.length === 0) return
    setTableIndexes((prev) => [...prev, {
      name: newIndex.name, columns: [...newIndex.columns],
      is_unique: newIndex.type === 'UNIQUE', is_primary: false,
      index_type: newIndex.type, _isNew: true,
    } as DesignerIndex])
    setShowAddIndexDialog(false)
  }

  function removeIndex(record: DesignerIndex) {
    if (latestRef.current.effectiveReadOnly) {
      warnReadOnly()
      return
    }
    if (!record._isNew) pendingDeletionsRef.current.indexes.push(record.name)
    setTableIndexes((prev) => prev.filter((i) => i.name !== record.name))
  }

  function addForeignKey() {
    if (latestRef.current.effectiveReadOnly) {
      warnReadOnly()
      return
    }
    setNewForeignKey({ name: '', column: '', refTable: '', refColumn: '', onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    setShowAddForeignKeyDialog(true)
  }

  function handleAddForeignKey() {
    if (latestRef.current.effectiveReadOnly) {
      warnReadOnly()
      setShowAddForeignKeyDialog(false)
      return
    }
    if (!newForeignKey.name || !newForeignKey.column || !newForeignKey.refTable || !newForeignKey.refColumn) return
    setTableForeignKeys((prev) => [...prev, {
      name: newForeignKey.name, column_name: newForeignKey.column,
      referenced_table_name: newForeignKey.refTable, referenced_column_name: newForeignKey.refColumn,
      update_rule: newForeignKey.onUpdate, delete_rule: newForeignKey.onDelete, _isNew: true,
    } as DesignerForeignKey])
    setShowAddForeignKeyDialog(false)
  }

  function removeForeignKey(record: DesignerForeignKey) {
    if (latestRef.current.effectiveReadOnly) {
      warnReadOnly()
      return
    }
    if (!record._isNew) pendingDeletionsRef.current.foreignKeys.push(record.name)
    setTableForeignKeys((prev) => prev.filter((f) => f.name !== record.name))
  }

  // ── 保存 ──

  function saveChanges() {
    if (latestRef.current.effectiveReadOnly) {
      warnReadOnly()
      return
    }
    const changes = collectChanges()
    if (changes.length === 0) {
      message.info(t('common.no_data'))
      return
    }
    previewChangesRef.current = changes
    setPreviewCount(changes.length)
    setPreviewSql(buildPreviewSql(changes))
    setShowPreviewDialog(true)
  }

  async function confirmSaveChanges() {
    if (latestRef.current.effectiveReadOnly) {
      warnReadOnly()
      resetPreviewState()
      return
    }
    if (previewChangesRef.current.length === 0) return

    setSaving(true)
    try {
      await queryApi.alterTableStructure({
        connectionId: latestRef.current.connectionId,
        database: latestRef.current.database,
        table: latestRef.current.table,
        schema: latestRef.current.schema || null,
        changes: previewChangesRef.current,
      })
      resetPreviewState()
      message.success(t('designer.save_success'))
      await loadStructure()
    } catch (error: unknown) {
      message.error(`${t('common.fail')}: ${error}`)
    } finally {
      setSaving(false)
    }
  }

  // ── initialTab/initialAction 定位与去重（照抄 Vue applyInitialState）──

  function resolveActionKey() {
    return `${connectionId}:${database}:${schema || ''}:${table}:${initialAction || ''}`
  }

  function applyInitialState() {
    setActiveTab(initialTab || 'columns')
    if (!initialAction || latestRef.current.effectiveReadOnly) return
    const actionKey = resolveActionKey()
    if (lastHandledActionRef.current === actionKey) return
    lastHandledActionRef.current = actionKey

    window.setTimeout(() => {
      if (initialAction === 'add_column') {
        setActiveTab('columns')
        addColumn()
      } else if (initialAction === 'add_index') {
        setActiveTab('indexes')
        addIndex()
      } else if (initialAction === 'add_foreign_key') {
        setActiveTab('foreign_keys')
        addForeignKey()
      }
    }, 0)
  }

  // 目标表变化：重置并重载（对等 onMounted + watch(props 目标)）
  useEffect(() => {
    lastHandledActionRef.current = ''
    ddlLoadedRef.current = false
    void (async () => {
      await loadStructure()
      applyInitialState()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, database, schema, table])

  // initialTab/initialAction 变化（同表重复打开设计入口）
  useEffect(() => {
    applyInitialState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, initialAction])

  // DDL tab 激活时加载
  useEffect(() => {
    if (activeTab === 'ddl') void loadDDL()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const tabItems = [
    {
      key: 'columns',
      label: t('designer.columns'),
      children: (
        <TableDesignerColumns
          columns={tableColumns}
          loading={loading}
          readOnly={effectiveReadOnly}
          onPatch={patchColumn}
          onRemove={removeColumn}
          onMove={moveColumn}
        />
      ),
    },
    {
      key: 'indexes',
      label: t('designer.indexes'),
      children: (
        <TableDesignerIndexes
          indexes={tableIndexes}
          loading={loading}
          readOnly={effectiveReadOnly}
          onAdd={addIndex}
          onRemove={removeIndex}
        />
      ),
    },
    {
      key: 'ddl',
      label: t('designer.ddl'),
      children: <DesignerDdlPane ddl={ddlSql} loading={loadingDDL} onCopy={() => void copyDDL()} />,
    },
    ...((tableForeignKeys.length > 0 || !effectiveReadOnly) ? [{
      key: 'foreign_keys',
      label: t('designer.foreign_keys'),
      children: (
        <TableDesignerForeignKeys
          foreignKeys={tableForeignKeys}
          loading={loading}
          readOnly={effectiveReadOnly}
          onAdd={addForeignKey}
          onRemove={removeForeignKey}
        />
      ),
    }] : []),
  ]

  return (
    <div className={styles.tableDesigner}>
      <div className={`panel-toolbar ${styles.designerToolbar}`}>
        <Space>
          {!effectiveReadOnly && (
            <>
              <Button icon={<SaveOutlined />} onClick={saveChanges} type="primary" loading={saving}>
                {t('common.save')}
              </Button>
              <Button icon={<PlusOutlined />} onClick={addColumn}>
                {t('designer.add_column')}
              </Button>
            </>
          )}
          <Button icon={<ReloadOutlined />} onClick={() => void loadStructure()} loading={loading}>
            {t('common.refresh')}
          </Button>
          <Divider type="vertical" />
          {effectiveReadOnly && <Tag color="gold">{t('designer.read_only_mode')}</Tag>}
          <Tag color="blue">{database}{schema ? '.' + schema : ''}.{table}</Tag>
        </Space>
      </div>

      <div className={styles.designerContent}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </div>

      <AntModal
        open={showAddIndexDialog}
        title={t('designer.add_index')}
        onOk={handleAddIndex}
        onCancel={() => setShowAddIndexDialog(false)}
      >
        <Form labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
          <Form.Item label={t('designer.index_name')}>
            <Input
              value={newIndex.name}
              onChange={(e) => setNewIndex((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t('designer.index_name_placeholder')}
            />
          </Form.Item>
          <Form.Item label={t('designer.index_type')}>
            <Select
              value={newIndex.type}
              onChange={(v) => setNewIndex((prev) => ({ ...prev, type: v }))}
              options={[
                { value: 'INDEX', label: 'NORMAL' },
                { value: 'UNIQUE', label: 'UNIQUE' },
                { value: 'FULLTEXT', label: 'FULLTEXT' },
              ]}
            />
          </Form.Item>
          <Form.Item label={t('designer.index_columns')}>
            <Select
              value={newIndex.columns}
              onChange={(v) => setNewIndex((prev) => ({ ...prev, columns: v }))}
              mode="multiple"
              placeholder={t('common.search')}
              options={tableColumns.map((col) => ({ value: col.name, label: col.name }))}
            />
          </Form.Item>
        </Form>
      </AntModal>

      <AntModal
        open={showAddForeignKeyDialog}
        title={t('designer.add_fk')}
        onOk={handleAddForeignKey}
        onCancel={() => setShowAddForeignKeyDialog(false)}
      >
        <Form labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
          <Form.Item label={t('designer.fk_name')}>
            <Input
              value={newForeignKey.name}
              onChange={(e) => setNewForeignKey((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t('designer.fk_name_placeholder')}
            />
          </Form.Item>
          <Form.Item label={t('designer.fk_column')}>
            <Select
              value={newForeignKey.column || undefined}
              onChange={(v) => setNewForeignKey((prev) => ({ ...prev, column: String(v) }))}
              options={tableColumns.map((col) => ({ value: col.name, label: col.name }))}
            />
          </Form.Item>
          <Form.Item label={t('designer.ref_table')}>
            <Input
              value={newForeignKey.refTable}
              onChange={(e) => setNewForeignKey((prev) => ({ ...prev, refTable: e.target.value }))}
              placeholder={t('designer.ref_table_placeholder')}
            />
          </Form.Item>
          <Form.Item label={t('designer.ref_column')}>
            <Input
              value={newForeignKey.refColumn}
              onChange={(e) => setNewForeignKey((prev) => ({ ...prev, refColumn: e.target.value }))}
              placeholder={t('designer.ref_column_placeholder')}
            />
          </Form.Item>
          <Form.Item label={t('designer.on_delete')}>
            <Select
              value={newForeignKey.onDelete}
              onChange={(v) => setNewForeignKey((prev) => ({ ...prev, onDelete: String(v) }))}
              options={['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION'].map((v) => ({ value: v, label: v }))}
            />
          </Form.Item>
          <Form.Item label={t('designer.on_update')}>
            <Select
              value={newForeignKey.onUpdate}
              onChange={(v) => setNewForeignKey((prev) => ({ ...prev, onUpdate: String(v) }))}
              options={['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION'].map((v) => ({ value: v, label: v }))}
            />
          </Form.Item>
        </Form>
      </AntModal>

      <AntModal
        open={showPreviewDialog}
        title={t('designer.change_preview')}
        okText={t('data.confirm_execute')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
        width="760px"
        onOk={() => void confirmSaveChanges()}
        onCancel={resetPreviewState}
      >
        <div className={styles.previewSummary}>
          <Tag color="blue">{t('designer.preview_change_count', { n: previewCount })}</Tag>
        </div>
        <div className={styles.previewHint}>{t('designer.preview_hint')}</div>
        <Input.TextArea value={previewSql} rows={18} readOnly className={styles.previewSql} />
      </AntModal>
    </div>
  )
}
