<template>
  <div class="table-designer">
    <div class="panel-toolbar designer-toolbar">
      <a-space>
        <template v-if="!effectiveReadOnly">
          <a-button :icon="h(SaveOutlined)" @click="saveChanges" type="primary" :loading="saving">
            {{ $t('common.save') }}
          </a-button>
          <a-button :icon="h(PlusOutlined)" @click="addColumn">
            {{ $t('designer.add_column') }}
          </a-button>
        </template>
        <a-button :icon="h(ReloadOutlined)" @click="loadStructure" :loading="loading">
          {{ $t('common.refresh') }}
        </a-button>
        <a-divider type="vertical" />
        <a-tag v-if="effectiveReadOnly" color="gold">{{ $t('designer.read_only_mode') }}</a-tag>
        <a-tag color="blue">{{ database }}{{ schema ? '.' + schema : '' }}.{{ table }}</a-tag>
      </a-space>
    </div>

    <div class="designer-content">
      <a-tabs v-model:activeKey="activeTab">
        <!-- 列定义 -->
        <a-tab-pane key="columns" :tab="$t('designer.columns')">
          <TableDesignerColumns
            :columns="tableColumns"
            :loading="loading"
            :read-only="effectiveReadOnly"
            @remove="removeColumn"
            @move="moveColumn"
          />
        </a-tab-pane>

        <!-- 索引 -->
        <a-tab-pane key="indexes" :tab="$t('designer.indexes')">
          <TableDesignerIndexes
            :indexes="tableIndexes"
            :loading="loading"
            :read-only="effectiveReadOnly"
            @add="addIndex"
            @remove="removeIndex"
          />
        </a-tab-pane>

        <!-- DDL -->
        <a-tab-pane key="ddl" :tab="$t('designer.ddl')">
          <div class="ddl-container" ref="ddlEditorContainer">
            <a-spin :spinning="loadingDDL" />
          </div>
          <div class="ddl-actions">
            <a-button :icon="h(CopyOutlined)" @click="copyDDL" size="small">
              {{ $t('data.copy_content') }}
            </a-button>
          </div>
        </a-tab-pane>

        <!-- 外键 -->
        <a-tab-pane key="foreign_keys" :tab="$t('designer.foreign_keys')" v-if="tableForeignKeys.length > 0 || !effectiveReadOnly">
          <TableDesignerForeignKeys
            :foreign-keys="tableForeignKeys"
            :loading="loading"
            :read-only="effectiveReadOnly"
            @add="addForeignKey"
            @remove="removeForeignKey"
          />
        </a-tab-pane>
      </a-tabs>
    </div>

    <!-- 添加索引对话框 -->
    <a-modal
      v-model:open="showAddIndexDialog"
      :title="$t('designer.add_index')"
      @ok="handleAddIndex"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 18 }">
        <a-form-item :label="$t('designer.index_name')">
          <a-input v-model:value="newIndex.name" placeholder="idx_column_name" />
        </a-form-item>
        <a-form-item :label="$t('designer.index_type')">
          <a-select v-model:value="newIndex.type">
            <a-select-option value="INDEX">NORMAL</a-select-option>
            <a-select-option value="UNIQUE">UNIQUE</a-select-option>
            <a-select-option value="FULLTEXT">FULLTEXT</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item :label="$t('designer.index_columns')">
          <a-select
            v-model:value="newIndex.columns"
            mode="multiple"
            :placeholder="$t('common.search')"
          >
            <a-select-option
              v-for="col in tableColumns"
              :key="col.name"
              :value="col.name"
            >
              {{ col.name }}
            </a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 添加外键对话框 -->
    <a-modal
      v-model:open="showAddForeignKeyDialog"
      :title="$t('designer.add_fk')"
      @ok="handleAddForeignKey"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 18 }">
        <a-form-item :label="$t('designer.fk_name')">
          <a-input v-model:value="newForeignKey.name" placeholder="fk_column_name" />
        </a-form-item>
        <a-form-item :label="$t('designer.fk_column')">
          <a-select v-model:value="newForeignKey.column">
            <a-select-option
              v-for="col in tableColumns"
              :key="col.name"
              :value="col.name"
            >
              {{ col.name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item :label="$t('designer.ref_table')">
          <a-input v-model:value="newForeignKey.refTable" placeholder="referenced_table" />
        </a-form-item>
        <a-form-item :label="$t('designer.ref_column')">
          <a-input v-model:value="newForeignKey.refColumn" placeholder="referenced_column" />
        </a-form-item>
        <a-form-item :label="$t('designer.on_delete')">
          <a-select v-model:value="newForeignKey.onDelete">
            <a-select-option value="CASCADE">CASCADE</a-select-option>
            <a-select-option value="SET NULL">SET NULL</a-select-option>
            <a-select-option value="RESTRICT">RESTRICT</a-select-option>
            <a-select-option value="NO ACTION">NO ACTION</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item :label="$t('designer.on_update')">
          <a-select v-model:value="newForeignKey.onUpdate">
            <a-select-option value="CASCADE">CASCADE</a-select-option>
            <a-select-option value="SET NULL">SET NULL</a-select-option>
            <a-select-option value="RESTRICT">RESTRICT</a-select-option>
            <a-select-option value="NO ACTION">NO ACTION</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="showPreviewDialog"
      :title="$t('designer.change_preview')"
      :ok-text="$t('data.confirm_execute')"
      :cancel-text="$t('common.cancel')"
      :confirm-loading="saving"
      width="760px"
      @ok="confirmSaveChanges"
      @cancel="resetPreviewState"
    >
      <div class="preview-summary">
        <a-tag color="blue">{{ $t('designer.preview_change_count', { n: previewChanges.length }) }}</a-tag>
      </div>
      <div class="preview-hint">{{ $t('designer.preview_hint') }}</div>
      <a-textarea :value="previewSql" :rows="18" readonly class="preview-sql" />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { h, reactive, ref, onMounted, watch, nextTick, computed } from 'vue'
import {
  SaveOutlined,
  ReloadOutlined,
  PlusOutlined,
  CopyOutlined,
} from '@ant-design/icons-vue'
import { message, Modal } from '@/ui/antd'
import { metadataApi, queryApi } from '@/api'
import { useI18n } from 'vue-i18n'
import { withErrorHandler } from '@/utils/errorHandler'
import { useMonacoEditor } from '@/composables/useMonacoEditor'
import { useConnectionStore } from '@/stores/connection'
import { writeClipboardText } from '@/utils/clipboard'
import TableDesignerColumns from './TableDesignerColumns.vue'
import TableDesignerIndexes from './TableDesignerIndexes.vue'
import TableDesignerForeignKeys from './TableDesignerForeignKeys.vue'
import type { ColumnInfo, IndexInfo, ForeignKeyInfo } from '@/types/database'

/** Extended column with designer metadata */
interface DesignerColumn extends ColumnInfo {
  length?: number
  _modified: boolean
  _isNew: boolean
  _originalName?: string
  _createdOrder?: number
}

/** Extended index with designer metadata */
interface DesignerIndex extends IndexInfo {
  _isNew: boolean
}

/** Extended foreign key with designer metadata */
interface DesignerForeignKey extends ForeignKeyInfo {
  _isNew: boolean
}

const { t } = useI18n()
const connectionStore = useConnectionStore()
const props = defineProps<{
  connectionId: string
  database: string
  table: string
  schema?: string
  readOnly?: boolean
}>()

const loading = ref(false)
const saving = ref(false)
const activeTab = ref('columns')
const loadingDDL = ref(false)
const ddlSql = ref('')
const showAddIndexDialog = ref(false)
const showAddForeignKeyDialog = ref(false)
const showPreviewDialog = ref(false)
const previewSql = ref('')
const previewChanges = ref<any[]>([])
const originalColumnOrder = ref<string[]>([])
const nextCreatedColumnOrder = ref(0)

const ddlEditorContainer = ref<HTMLElement>()
const { editor: ddlEditor, setValue: setDdlValue, createEditor: createDdlEditor } = useMonacoEditor(ddlEditorContainer, {
  value: '-- Loading DDL...\n',
  language: 'sql',
  readOnly: true,
})

// 表列定义
const tableColumns = ref<DesignerColumn[]>([])
const tableIndexes = ref<DesignerIndex[]>([])
const tableForeignKeys = ref<DesignerForeignKey[]>([])

// 待处理的删除队列
const pendingDeletions = reactive({
  columns: [] as string[],
  indexes: [] as string[],
  foreignKeys: [] as string[],
})

// 新索引
const newIndex = reactive({
  name: '',
  type: 'INDEX',
  columns: [] as string[],
})

// 新外键
const newForeignKey = reactive({
  name: '',
  column: '',
  refTable: '',
  refColumn: '',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
})

const currentConnection = computed(() => connectionStore.connections.find(connection => connection.id === props.connectionId) || null)
const effectiveReadOnly = computed(() => Boolean(props.readOnly) || Boolean(currentConnection.value?.read_only))
const dbType = computed(() => currentConnection.value?.db_type || 'mysql')

function warnReadOnly() {
  message.warning(t('designer.read_only_blocked'))
}

function resetPreviewState() {
  showPreviewDialog.value = false
  previewSql.value = ''
  previewChanges.value = []
}

// 加载表结构
async function loadStructure() {
  return withErrorHandler(async () => {
    loading.value = true
    resetPreviewState()
    const params = {
      connectionId: props.connectionId,
      table: props.table,
      schema: props.schema || null,
      database: props.database,
    }

    const [columns, indexes, foreignKeys] = await Promise.all([
      metadataApi.getTableStructure(params),
      metadataApi.getTableIndexes(params),
      metadataApi.getTableForeignKeys(params)
    ])

    tableColumns.value = columns.map(col => ({
      ...col,
      length: col.character_maximum_length ? Number(col.character_maximum_length) : extractLength(col.data_type),
      data_type: extractBaseType(col.data_type),
      _modified: false, _isNew: false, _originalName: col.name,
    }))
    originalColumnOrder.value = columns.map(col => col.name)
    nextCreatedColumnOrder.value = 0

    tableIndexes.value = indexes.map(idx => ({ ...idx, _isNew: false }))
    tableForeignKeys.value = foreignKeys.map(fk => ({ ...fk, _isNew: false }))

    // 重置删除队列
    pendingDeletions.columns = []
    pendingDeletions.indexes = []
    pendingDeletions.foreignKeys = []

    if (activeTab.value === 'ddl') loadDDL()
  }, {
    messagePrefix: t('designer.load_fail'),
    onError: () => { loading.value = false },
    showMessage: true
  }).finally(() => {
    loading.value = false
  })
}

// 提取数据类型的长度
function extractLength(dataType: string): number | undefined {
  const match = dataType.match(/\((\d+)\)/)
  return match ? parseInt(match[1]) : undefined
}

// 提取基础数据类型
function extractBaseType(dataType: string): string {
  return dataType.replace(/\(.*\)/, '').toUpperCase()
}

function quoteIdentifier(name: string) {
  return dbType.value === 'mysql' ? `\`${name}\`` : `"${name.replace(/"/g, '""')}"`
}

function tableIdentifier() {
  if (dbType.value === 'postgresql') {
    return `${quoteIdentifier(props.schema || 'public')}.${quoteIdentifier(props.table)}`
  }
  if (dbType.value === 'mysql' && props.database) {
    return `${quoteIdentifier(props.database)}.${quoteIdentifier(props.table)}`
  }
  return quoteIdentifier(props.table)
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
  const parts = [`${quoteIdentifier(column.name)} ${buildColumnDataType(column)}`]
  if (!column.nullable) parts.push('NOT NULL')
  if (column.default_value !== undefined && column.default_value !== null && column.default_value !== '') {
    parts.push(`DEFAULT ${quoteLiteral(column.default_value)}`)
  }
  if (dbType.value === 'mysql' && column.is_auto_increment) {
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

function collectReorderChanges() {
  if (dbType.value !== 'mysql') return []

  const currentColumns = tableColumns.value.slice()
  const defaultColumns = [
    ...currentColumns
      .filter(column => !column._isNew)
      .sort((left, right) => originalColumnOrder.value.indexOf(left._originalName || left.name) - originalColumnOrder.value.indexOf(right._originalName || right.name)),
    ...currentColumns
      .filter(column => column._isNew)
      .sort((left, right) => (left._createdOrder ?? 0) - (right._createdOrder ?? 0)),
  ]

  const workingOrder = defaultColumns.slice()
  const changes: Array<{ type: string, data: any }> = []

  for (let targetIndex = 0; targetIndex < currentColumns.length; targetIndex += 1) {
    const targetColumn = currentColumns[targetIndex]
    const targetIdentity = getColumnIdentity(targetColumn)
    const currentIndex = workingOrder.findIndex(column => getColumnIdentity(column) === targetIdentity)

    if (currentIndex === -1 || currentIndex === targetIndex) continue

    const [movedColumn] = workingOrder.splice(currentIndex, 1)
    workingOrder.splice(targetIndex, 0, movedColumn)

    changes.push({
      type: 'reorder_column',
      data: {
        column: buildColumnPayload(targetColumn),
        after_column: targetIndex === 0 ? null : currentColumns[targetIndex - 1].name
      }
    })
  }

  return changes
}

function collectChanges() {
  const changes: any[] = []

  for (const col of tableColumns.value) {
    if (!col._modified && !col._isNew) continue
    const columnInfo = buildColumnPayload(col)

    if (col._isNew) {
      changes.push({ type: 'add_column', data: columnInfo })
    } else {
      changes.push({ type: 'modify_column', data: { old_name: col._originalName || col.name, new_column: columnInfo } })
    }
  }

  pendingDeletions.columns.forEach(name => changes.push({ type: 'drop_column', data: name }))
  pendingDeletions.indexes.forEach(name => changes.push({ type: 'drop_index', data: name }))
  pendingDeletions.foreignKeys.forEach(name => changes.push({ type: 'drop_foreign_key', data: name }))

  for (const idx of tableIndexes.value) {
    if (idx._isNew) {
      changes.push({ type: 'add_index', data: { ...idx, _isNew: undefined } })
    }
  }

  for (const fk of tableForeignKeys.value) {
    if (fk._isNew) {
      changes.push({ type: 'add_foreign_key', data: { ...fk, _isNew: undefined } })
    }
  }

  changes.push(...collectReorderChanges())

  return changes
}

function buildPreviewSql(changes: any[]) {
  const statements: string[] = []
  const targetTable = tableIdentifier()

  for (const change of changes) {
    switch (change.type) {
      case 'add_column': {
        const column = change.data
        statements.push(`ALTER TABLE ${targetTable} ADD COLUMN ${buildColumnDefinition(column)};`)
        break
      }
      case 'modify_column': {
        const oldName = change.data.old_name
        const column = change.data.new_column
        if (dbType.value === 'sqlite') {
          statements.push(`-- SQLite 暂不支持在线修改列: ${oldName} -> ${column.name}`)
          break
        }
        if (dbType.value === 'postgresql') {
          if (oldName !== column.name) {
            statements.push(`ALTER TABLE ${targetTable} RENAME COLUMN ${quoteIdentifier(oldName)} TO ${quoteIdentifier(column.name)};`)
          }
          statements.push(`ALTER TABLE ${targetTable} ALTER COLUMN ${quoteIdentifier(column.name)} TYPE ${buildColumnDataType(column)};`)
          statements.push(`ALTER TABLE ${targetTable} ALTER COLUMN ${quoteIdentifier(column.name)} ${column.nullable ? 'DROP' : 'SET'} NOT NULL;`)
          break
        }
        const operation = oldName !== column.name ? `CHANGE COLUMN ${quoteIdentifier(oldName)} ${buildColumnDefinition(column)}` : `MODIFY COLUMN ${buildColumnDefinition(column)}`
        statements.push(`ALTER TABLE ${targetTable} ${operation};`)
        break
      }
      case 'drop_column':
        statements.push(dbType.value === 'sqlite'
          ? `-- SQLite 暂不支持在线删除列: ${change.data}`
          : `ALTER TABLE ${targetTable} DROP COLUMN ${quoteIdentifier(change.data)};`)
        break
      case 'reorder_column': {
        if (dbType.value !== 'mysql') {
          statements.push(`-- ${dbType.value} 暂不支持调整字段顺序: ${change.data.column.name}`)
          break
        }
        const column = change.data.column
        const positionSql = change.data.after_column
          ? `AFTER ${quoteIdentifier(change.data.after_column)}`
          : 'FIRST'
        statements.push(`ALTER TABLE ${targetTable} MODIFY COLUMN ${buildColumnDefinition(column)} ${positionSql};`)
        break
      }
      case 'add_index': {
        const idx = change.data
        const columns = idx.columns.map((name: string) => quoteIdentifier(name)).join(', ')
        if (dbType.value === 'postgresql') {
          statements.push(`CREATE ${idx.is_unique ? 'UNIQUE ' : ''}INDEX ${quoteIdentifier(idx.name)} ON ${targetTable} (${columns});`)
        } else {
          statements.push(`ALTER TABLE ${targetTable} ADD ${idx.is_unique ? 'UNIQUE ' : ''}INDEX ${quoteIdentifier(idx.name)} (${columns});`)
        }
        break
      }
      case 'drop_index':
        if (dbType.value === 'postgresql') {
          statements.push(`DROP INDEX ${props.schema ? `${quoteIdentifier(props.schema)}.` : ''}${quoteIdentifier(change.data)};`)
        } else if (dbType.value === 'sqlite') {
          statements.push(`-- SQLite 暂不支持在线删除索引: ${change.data}`)
        } else {
          statements.push(`ALTER TABLE ${targetTable} DROP INDEX ${quoteIdentifier(change.data)};`)
        }
        break
      case 'add_foreign_key': {
        const fk = change.data
        statements.push(
          `ALTER TABLE ${targetTable} ADD CONSTRAINT ${quoteIdentifier(fk.name)} FOREIGN KEY (${quoteIdentifier(fk.column_name)}) REFERENCES ${quoteIdentifier(fk.referenced_table_name)} (${quoteIdentifier(fk.referenced_column_name)}) ON UPDATE ${fk.update_rule || 'NO ACTION'} ON DELETE ${fk.delete_rule || 'NO ACTION'};`
        )
        break
      }
      case 'drop_foreign_key':
        if (dbType.value === 'postgresql') {
          statements.push(`ALTER TABLE ${targetTable} DROP CONSTRAINT ${quoteIdentifier(change.data)};`)
        } else if (dbType.value === 'sqlite') {
          statements.push(`-- SQLite 暂不支持在线删除外键: ${change.data}`)
        } else {
          statements.push(`ALTER TABLE ${targetTable} DROP FOREIGN KEY ${quoteIdentifier(change.data)};`)
        }
        break
      default:
        statements.push(`-- Unsupported change: ${JSON.stringify(change)}`)
        break
    }
  }

  return statements.join('\n\n')
}

// 添加列
function addColumn() {
  if (effectiveReadOnly.value) {
    warnReadOnly()
    return
  }
  tableColumns.value.push({
    name: `column_${tableColumns.value.length + 1}`,
    data_type: 'VARCHAR', length: 255, nullable: true,
    is_primary_key: false, is_auto_increment: false,
    default_value: undefined, comment: '', _modified: true, _isNew: true, _createdOrder: nextCreatedColumnOrder.value++,
  })
}

// 移除列
function removeColumn(index: number) {
  if (effectiveReadOnly.value) {
    warnReadOnly()
    return
  }
  const col = tableColumns.value[index]
  Modal.confirm({
    title: t('common.delete'),
    content: `${t('common.delete')} "${col.name}"?`,
    okText: t('common.delete'), okType: 'danger',
    onOk() {
      if (!col._isNew) {
        pendingDeletions.columns.push(col._originalName || col.name)
      }
      tableColumns.value.splice(index, 1)
    },
  })
}

// 移动列
function moveColumn(index: number, direction: number) {
  if (effectiveReadOnly.value) {
    warnReadOnly()
    return
  }
  const newIdx = index + direction
  if (newIdx < 0 || newIdx >= tableColumns.value.length) return
  const temp = tableColumns.value[index]
  tableColumns.value[index] = tableColumns.value[newIdx]
  tableColumns.value[newIdx] = temp
  tableColumns.value[index]._modified = true
  tableColumns.value[newIdx]._modified = true
}

// 保存更改
async function saveChanges() {
  if (effectiveReadOnly.value) {
    warnReadOnly()
    return
  }
  const changes = collectChanges()
  if (changes.length === 0) {
    message.info(t('common.no_data'))
    return
  }

  previewChanges.value = changes
  previewSql.value = buildPreviewSql(changes)
  showPreviewDialog.value = true
}

async function confirmSaveChanges() {
  if (effectiveReadOnly.value) {
    warnReadOnly()
    resetPreviewState()
    return
  }
  if (previewChanges.value.length === 0) return

  saving.value = true
  try {
    await queryApi.alterTableStructure({
      connectionId: props.connectionId,
      database: props.database,
      table: props.table,
      schema: props.schema || null,
      changes: previewChanges.value
    })

    resetPreviewState()
    message.success(t('designer.save_success'))
    await loadStructure()
  } catch (error: unknown) {
    message.error(`${t('common.fail')}: ${error}`)
  } finally {
    saving.value = false
  }
}

// 查看DDL
async function loadDDL() {
  loadingDDL.value = true
  try {
    const result = await metadataApi.getCreateTableDdl({
      connectionId: props.connectionId, database: props.database,
      table: props.table, schema: props.schema,
    })
    const formattedResult = result.replace(/\\n/g, '\n')
    ddlSql.value = formattedResult
    if (!ddlEditor.value) await createDdlEditor()
    if (ddlEditor.value) {
      setDdlValue(formattedResult)
      nextTick(() => ddlEditor.value?.layout())
    }
  } catch (error: unknown) {
    message.error(`${t('designer.ddl')} ${t('common.fail')}: ${error}`)
    if (ddlEditor.value) setDdlValue(`-- Error: ${error}`)
  } finally {
    loadingDDL.value = false
  }
}

// 复制DDL
async function copyDDL() { await writeClipboardText(ddlSql.value); message.success(t('common.copy') + ' ' + t('common.ok')) }

// 添加索引
function addIndex() {
  if (effectiveReadOnly.value) {
    warnReadOnly()
    return
  }
  newIndex.name = ''; newIndex.type = 'INDEX'; newIndex.columns = []; showAddIndexDialog.value = true
}

// 处理添加索引
async function handleAddIndex() {
  if (effectiveReadOnly.value) {
    warnReadOnly()
    showAddIndexDialog.value = false
    return
  }
  if (!newIndex.name || newIndex.columns.length === 0) return
  tableIndexes.value.push({
    name: newIndex.name, columns: [...newIndex.columns],
    is_unique: newIndex.type === 'UNIQUE', is_primary: false,
    index_type: newIndex.type, _isNew: true
  })
  showAddIndexDialog.value = false
}

// 删除索引
async function removeIndex(record: { index_name: string; _isNew?: boolean; name?: string; [key: string]: unknown }) {
  if (effectiveReadOnly.value) {
    warnReadOnly()
    return
  }
  if (!record._isNew) pendingDeletions.indexes.push(record.name!)
  tableIndexes.value = tableIndexes.value.filter(i => i.name !== record.name!)
}

// 添加外键
function addForeignKey() {
  if (effectiveReadOnly.value) {
    warnReadOnly()
    return
  }
  newForeignKey.name = ''; newForeignKey.column = ''; newForeignKey.refTable = '';
  newForeignKey.refColumn = ''; newForeignKey.onDelete = 'CASCADE'; newForeignKey.onUpdate = 'CASCADE';
  showAddForeignKeyDialog.value = true
}

// 处理添加外键
async function handleAddForeignKey() {
  if (effectiveReadOnly.value) {
    warnReadOnly()
    showAddForeignKeyDialog.value = false
    return
  }
  if (!newForeignKey.name || !newForeignKey.column || !newForeignKey.refTable || !newForeignKey.refColumn) return
  tableForeignKeys.value.push({
    name: newForeignKey.name, column_name: newForeignKey.column,
    referenced_table_name: newForeignKey.refTable, referenced_column_name: newForeignKey.refColumn,
    update_rule: newForeignKey.onUpdate, delete_rule: newForeignKey.onDelete, _isNew: true
  })
  showAddForeignKeyDialog.value = false
}

// 删除外键
async function removeForeignKey(record: { fk_name: string; _isNew?: boolean; name?: string; [key: string]: unknown }) {
  if (effectiveReadOnly.value) {
    warnReadOnly()
    return
  }
  if (!record._isNew) pendingDeletions.foreignKeys.push(record.name!)
  tableForeignKeys.value = tableForeignKeys.value.filter(f => f.name !== record.name)
}

// 初始加载
onMounted(() => { loadStructure() })
watch(activeTab, (tab) => { if (tab === 'ddl') loadDDL() })
watch(() => [props.connectionId, props.database, props.schema, props.table], () => { loadStructure() })
</script>

<style scoped>
.table-designer { height: 100%; display: flex; flex-direction: column; }
.designer-content { flex: 1; overflow: hidden; }
.designer-content :deep(.ant-tabs) { height: 100%; }
.designer-content :deep(.ant-tabs-content) { height: 100%; }
.ddl-container { height: calc(100vh - 300px); border: 1px solid var(--border-color); margin: 16px; position: relative; }
.ddl-actions { margin: 0 16px 16px 16px; }
.preview-sql :deep(textarea) { font-family: monospace; }
</style>
