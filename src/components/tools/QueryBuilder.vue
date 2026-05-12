<template>
  <div class="query-builder">
    <div class="builder-header">
      <h3>{{ $t('tools.query_builder.title') }}</h3>
      <p>{{ $t('tools.query_builder.subtitle') }}</p>
    </div>

    <div class="builder-config">
        <a-form layout="vertical">
          <a-form-item :label="$t('tools.query_builder.database')">
            <a-select v-model:value="selectedDatabase" :placeholder="$t('tools.query_builder.database_placeholder')" @change="loadTables">
            <a-select-option
              v-for="db in databases"
              :key="db.name"
              :value="db.name"
            >
              {{ db.name }}
            </a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item :label="$t('tools.query_builder.main_table')">
          <a-select
            v-model:value="mainTable"
            :placeholder="$t('tools.query_builder.main_table_placeholder')"
            :disabled="!selectedDatabase"
            @change="loadTableColumns"
          >
            <a-select-option
              v-for="table in tables"
              :key="buildTableKey(table)"
              :value="buildTableKey(table)"
            >
              {{ formatTableLabel(table) }}
            </a-select-option>
          </a-select>
        </a-form-item>
      </a-form>

      <a-divider>{{ $t('tools.query_builder.query_config') }}</a-divider>

      <!-- SELECT 子句 -->
      <div class="query-section">
        <h4>{{ $t('tools.query_builder.select_columns') }}</h4>
        <a-checkbox-group v-model:value="selectedColumns" style="width: 100%;">
          <a-row>
            <a-col :span="8" v-for="col in columns" :key="col.name" style="margin-bottom: 8px;">
              <a-checkbox :value="col.name">
                {{ col.name }}
                <a-tag size="small" color="blue">{{ col.data_type }}</a-tag>
              </a-checkbox>
            </a-col>
          </a-row>
        </a-checkbox-group>
        <a-button size="small" @click="selectAllColumns" style="margin-top: 8px;">
          {{ $t('common.select_all') }}
        </a-button>
        <a-button size="small" @click="clearAllColumns" style="margin-left: 8px;">
          {{ $t('common.clear') }}
        </a-button>
      </div>

      <!-- WHERE 子句 -->
      <div class="query-section">
        <h4>
          {{ $t('tools.query_builder.where_conditions') }}
          <a-button size="small" type="link" @click="addCondition">
            <PlusOutlined />
            {{ $t('tools.query_builder.add_condition') }}
          </a-button>
        </h4>
        <div v-for="(condition, index) in conditions" :key="index" class="condition-row">
          <div class="condition-grid">
            <div class="condition-field condition-column">
              <a-select v-model:value="condition.column" :placeholder="$t('tools.query_builder.column')">
                <a-select-option
                  v-for="col in columns"
                  :key="col.name"
                  :value="col.name"
                >
                  {{ col.name }}
                </a-select-option>
              </a-select>
            </div>
            <div class="condition-field condition-operator">
              <a-select v-model:value="condition.operator" :placeholder="$t('tools.query_builder.operator')">
                <a-select-option value="=">=</a-select-option>
                <a-select-option value="!=">!=</a-select-option>
                <a-select-option value=">">></a-select-option>
                <a-select-option value="<"><</a-select-option>
                <a-select-option value=">=">>=</a-select-option>
                <a-select-option value="<="><=</a-select-option>
                <a-select-option value="LIKE">LIKE</a-select-option>
                <a-select-option value="IN">IN</a-select-option>
                <a-select-option value="IS NULL">IS NULL</a-select-option>
                <a-select-option value="IS NOT NULL">IS NOT NULL</a-select-option>
              </a-select>
            </div>
            <div class="condition-field condition-value">
              <a-input
                v-model:value="condition.value"
                :placeholder="$t('tools.query_builder.value_label')"
                :disabled="condition.operator === 'IS NULL' || condition.operator === 'IS NOT NULL'"
              />
            </div>
            <div class="condition-field condition-logic">
              <a-select v-model:value="condition.logic" :placeholder="$t('tools.query_builder.logic')">
                <a-select-option value="AND">AND</a-select-option>
                <a-select-option value="OR">OR</a-select-option>
              </a-select>
            </div>
            <div class="condition-field condition-action">
              <a-button type="text" danger @click="removeCondition(index)">
                <DeleteOutlined />
              </a-button>
            </div>
          </div>
        </div>
      </div>

      <!-- ORDER BY 子句 -->
      <div class="query-section">
        <h4>{{ $t('tools.query_builder.order_by') }}</h4>
        <div class="order-grid">
          <div class="order-field order-column">
            <a-select v-model:value="orderByColumn" :placeholder="$t('tools.query_builder.order_column')" allow-clear>
              <a-select-option
                v-for="col in columns"
                :key="col.name"
                :value="col.name"
              >
                {{ col.name }}
              </a-select-option>
            </a-select>
          </div>
          <div class="order-field order-direction">
            <a-select v-model:value="orderDirection" :placeholder="$t('tools.query_builder.order_direction')">
              <a-select-option value="ASC">{{ $t('tools.query_builder.asc') }}</a-select-option>
              <a-select-option value="DESC">{{ $t('tools.query_builder.desc') }}</a-select-option>
            </a-select>
          </div>
        </div>
      </div>

      <!-- LIMIT 子句 -->
      <div class="query-section">
        <h4>{{ $t('tools.query_builder.limit_rows') }}</h4>
        <a-input-number v-model:value="limitRows" :min="1" :max="10000" style="width: 200px;" />
      </div>
    </div>

    <!-- 生成的SQL -->
    <div class="generated-sql">
      <a-divider>{{ $t('tools.query_builder.generated_sql') }}</a-divider>
      <div class="sql-preview">
        <pre>{{ generatedSql }}</pre>
        <div class="sql-actions">
          <a-space>
            <a-button @click="copySql">
              <CopyOutlined />
              {{ $t('common.copy') }}
            </a-button>
            <a-button type="primary" @click="executeSql">
              <CaretRightOutlined />
              {{ $t('common.execute') }}
            </a-button>
          </a-space>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  CaretRightOutlined,
} from '@ant-design/icons-vue'
import { message } from '@/ui/antd'
import { useI18n } from 'vue-i18n'
import { metadataApi } from '@/api'
import { useConnectionStore } from '@/stores/connection'
import type { DatabaseInfo, TableInfo, ColumnInfo, DatabaseType } from '@/types/database'
import { writeClipboardText } from '@/utils/clipboard'

interface WhereCondition {
  column: string
  operator: string
  value: string
  logic: string
}

const { t } = useI18n()
const connectionStore = useConnectionStore()

const props = defineProps<{
  connectionId: string | null
  initialDatabase?: string | null
}>()

const emit = defineEmits<{
  executeQuery: [{ sql: string; database?: string }]
}>()

const databases = ref<DatabaseInfo[]>([])
const selectedDatabase = ref('')
const tables = ref<TableInfo[]>([])
const mainTable = ref('')
const columns = ref<ColumnInfo[]>([])
const selectedColumns = ref<string[]>([])
const conditions = ref<WhereCondition[]>([])
const orderByColumn = ref('')
const orderDirection = ref('ASC')
const limitRows = ref(100)

const currentConnection = computed(() =>
  props.connectionId ? connectionStore.connections.find(item => item.id === props.connectionId) || null : null
)
const currentDbType = computed<DatabaseType | null>(() => currentConnection.value?.db_type || null)
const selectedTableInfo = computed(() => tables.value.find(table => buildTableKey(table) === mainTable.value) || null)

function buildTableKey(table: TableInfo) {
  return `${table.schema || ''}:${table.name}`
}

function formatTableLabel(table: TableInfo) {
  return table.schema ? `${table.schema}.${table.name}` : table.name
}

function quoteIdentifier(name: string) {
  if (currentDbType.value === 'mysql') return `\`${name}\``
  return `"${name.replace(/"/g, '""')}"`
}

function buildMainTableSql() {
  if (!selectedTableInfo.value) return ''

  if (currentDbType.value === 'postgresql') {
    return `${quoteIdentifier(selectedTableInfo.value.schema || 'public')}.${quoteIdentifier(selectedTableInfo.value.name)}`
  }

  if (currentDbType.value === 'mysql') {
    return `${quoteIdentifier(selectedDatabase.value)}.${quoteIdentifier(selectedTableInfo.value.name)}`
  }

  return quoteIdentifier(selectedTableInfo.value.name)
}

// 生成SQL
const generatedSql = computed(() => {
  if (!selectedDatabase.value || !selectedTableInfo.value) {
    return t('tools.query_builder.placeholder_sql')
  }

  let sql = 'SELECT '

  // SELECT 子句
  if (selectedColumns.value.length === 0) {
    sql += '*'
  } else {
    sql += selectedColumns.value.map(col => quoteIdentifier(col)).join(', ')
  }

  // FROM 子句
  sql += `\nFROM ${buildMainTableSql()}`

  // WHERE 子句
  if (conditions.value.length > 0) {
    const whereConditions = conditions.value
      .filter(c => c.column && c.operator)
      .map((c, index) => {
        let condition = ''

        if (c.operator === 'IS NULL' || c.operator === 'IS NOT NULL') {
          condition = `${quoteIdentifier(c.column)} ${c.operator}`
        } else if (c.operator === 'LIKE') {
          condition = `${quoteIdentifier(c.column)} LIKE '%${c.value}%'`
        } else if (c.operator === 'IN') {
          condition = `${quoteIdentifier(c.column)} IN (${c.value})`
        } else {
          condition = `${quoteIdentifier(c.column)} ${c.operator} '${c.value}'`
        }

        if (index > 0 && c.logic) {
          return `${c.logic} ${condition}`
        }
        return condition
      })

    if (whereConditions.length > 0) {
      sql += `\nWHERE ${whereConditions.join('\n  ')}`
    }
  }

  // ORDER BY 子句
  if (orderByColumn.value) {
    sql += `\nORDER BY ${quoteIdentifier(orderByColumn.value)} ${orderDirection.value}`
  }

  // LIMIT 子句
  sql += `\nLIMIT ${limitRows.value}`

  sql += ';'

  return sql
})

// 加载数据库列表
async function loadDatabases() {
  if (!props.connectionId) return

  try {
    const dbs = await metadataApi.getDatabases(props.connectionId!)
    databases.value = dbs
    if (props.initialDatabase && dbs.some(db => db.name === props.initialDatabase)) {
      selectedDatabase.value = props.initialDatabase
      await loadTables()
    } else if (dbs.length === 1) {
      selectedDatabase.value = dbs[0].name
      await loadTables()
    }
  } catch (error: unknown) {
    message.error(t('tools.query_builder.load_db_fail', { error: String(error) }))
  }
}

// 加载表列表
async function loadTables() {
  mainTable.value = ''
  tables.value = []
  columns.value = []
  selectedColumns.value = []
  conditions.value = []
  orderByColumn.value = ''
  if (!selectedDatabase.value || !props.connectionId) return

  try {
    const tbls = await metadataApi.getTables(props.connectionId!, selectedDatabase.value)
    tables.value = tbls
  } catch (error: unknown) {
    message.error(t('tools.query_builder.load_table_fail', { error: String(error) }))
  }
}

// 加载表列
async function loadTableColumns() {
  if (!selectedTableInfo.value || !selectedDatabase.value || !props.connectionId) return

  try {
    const cols = await metadataApi.getTableStructure({
      connectionId: props.connectionId!,
      table: selectedTableInfo.value.name,
      schema: selectedTableInfo.value.schema || null,
      database: selectedDatabase.value,
    })
    columns.value = cols
    selectedColumns.value = []
    conditions.value = []
  } catch (error: unknown) {
    message.error(t('tools.query_builder.load_column_fail', { error: String(error) }))
  }
}

// 选择所有列
function selectAllColumns() {
  selectedColumns.value = columns.value.map(col => col.name)
}

// 清空所有列
function clearAllColumns() {
  selectedColumns.value = []
}

// 添加条件
function addCondition() {
  conditions.value.push({
    column: '',
    operator: '=',
    value: '',
    logic: 'AND',
  })
}

// 移除条件
function removeCondition(index: number) {
  conditions.value.splice(index, 1)
}

// 复制SQL
async function copySql() {
  await writeClipboardText(generatedSql.value)
  message.success(t('tools.query_builder.copy_success'))
}

// 执行SQL
function executeSql() {
  emit('executeQuery', { sql: generatedSql.value, database: selectedDatabase.value })
  message.success(t('tools.query_builder.execute_success'))
}

// 初始化
watch(() => props.connectionId, (id) => {
  databases.value = []
  selectedDatabase.value = ''
  tables.value = []
  mainTable.value = ''
  columns.value = []
  selectedColumns.value = []
  conditions.value = []
  orderByColumn.value = ''
  if (id) loadDatabases()
}, { immediate: true })
</script>

<style scoped>
.query-builder {
  padding: 24px;
  width: 100%;
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
}

.builder-config,
.generated-sql,
.builder-header {
  max-width: 1200px;
  margin: 0 auto;
}

.builder-header {
  margin-bottom: 24px;
}

.builder-header h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
}

.builder-header p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.query-section {
  margin-bottom: 24px;
  padding: 16px;
  background: #fafafa;
  border-radius: 6px;
}

.dark-mode .query-section {
  background: #1a1a1a;
}

.query-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.condition-row {
  margin-bottom: 12px;
}

.condition-grid {
  display: grid;
  grid-template-columns: minmax(260px, 2.2fr) minmax(140px, 1.2fr) minmax(220px, 2fr) minmax(120px, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.condition-field {
  min-width: 0;
}

.condition-field :deep(.ant-select),
.condition-field :deep(.ant-input) {
  width: 100%;
}

.condition-field :deep(.ant-select-selector) {
  min-height: 32px;
}

.condition-action {
  display: flex;
  justify-content: center;
}

.order-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.order-field {
  min-width: 0;
}

.order-column {
  flex: 1 1 360px;
  max-width: 560px;
}

.order-direction {
  flex: 0 1 180px;
  min-width: 150px;
  max-width: 220px;
}

.order-field :deep(.ant-select) {
  width: 100%;
}

.generated-sql {
  margin-top: 24px;
}

.sql-preview {
  position: relative;
  background: #f5f5f5;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  padding: 16px;
}

.dark-mode .sql-preview {
  background: #262626;
  border-color: #303030;
}

.sql-preview pre {
  margin: 0;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.sql-actions {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e8e8e8;
}

.dark-mode .sql-actions {
  border-top-color: #303030;
}

@media (max-width: 960px) {
  .condition-grid {
    grid-template-columns: minmax(220px, 1fr) minmax(140px, 180px);
  }

  .order-column {
    flex-basis: 280px;
    max-width: 100%;
  }

  .condition-value,
  .condition-logic {
    grid-column: span 1;
  }
}

@media (max-width: 640px) {
  .query-builder {
    padding: 16px;
  }

  .condition-grid {
    grid-template-columns: 1fr;
  }

  .order-column,
  .order-direction {
    flex: 1 1 100%;
    max-width: 100%;
  }

  .condition-action {
    justify-content: flex-end;
  }
}
</style>
