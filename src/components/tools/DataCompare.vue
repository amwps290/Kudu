<template>
  <div class="data-compare">
    <div class="section-header compare-header">
      <h3>{{ $t('tools.data_compare.title') }}</h3>
      <p>{{ $t('tools.data_compare.subtitle') }}</p>
    </div>

    <div class="compare-config">
      <a-row :gutter="16">
        <a-col :span="12">
          <a-card :title="$t('tools.data_compare.source')" size="small">
            <a-form layout="vertical">
              <a-form-item :label="$t('tools.data_compare.database')">
                <a-select v-model:value="sourceDatabase" :placeholder="$t('tools.data_compare.database_placeholder')">
                  <a-select-option
                    v-for="db in databases"
                    :key="db.name"
                    :value="db.name"
                  >
                    {{ db.name }}
                  </a-select-option>
                </a-select>
              </a-form-item>
              <a-form-item :label="$t('tools.data_compare.table')">
                <a-select
                  v-model:value="sourceTable"
                  :placeholder="$t('tools.data_compare.table_placeholder')"
                  :disabled="!sourceDatabase"
                >
                  <a-select-option
                    v-for="table in sourceTables"
                    :key="buildTableKey(table)"
                    :value="buildTableKey(table)"
                  >
                    {{ formatTableLabel(table) }}
                  </a-select-option>
                </a-select>
              </a-form-item>
            </a-form>
          </a-card>
        </a-col>

        <a-col :span="12">
          <a-card :title="$t('tools.data_compare.target')" size="small">
            <a-form layout="vertical">
              <a-form-item :label="$t('tools.data_compare.database')">
                <a-select v-model:value="targetDatabase" :placeholder="$t('tools.data_compare.database_placeholder')">
                  <a-select-option
                    v-for="db in databases"
                    :key="db.name"
                    :value="db.name"
                  >
                    {{ db.name }}
                  </a-select-option>
                </a-select>
              </a-form-item>
              <a-form-item :label="$t('tools.data_compare.table')">
                <a-select
                  v-model:value="targetTable"
                  :placeholder="$t('tools.data_compare.table_placeholder')"
                  :disabled="!targetDatabase"
                >
                  <a-select-option
                    v-for="table in targetTables"
                    :key="buildTableKey(table)"
                    :value="buildTableKey(table)"
                  >
                    {{ formatTableLabel(table) }}
                  </a-select-option>
                </a-select>
              </a-form-item>
            </a-form>
          </a-card>
        </a-col>
      </a-row>

      <div class="compare-options">
        <a-space>
          <a-button type="primary" @click="handleCompare" :loading="comparing">
            <RetweetOutlined />
            {{ $t('tools.data_compare.start_compare') }}
          </a-button>
          <a-checkbox v-model:checked="compareStructure">
            {{ $t('tools.data_compare.compare_structure') }}
          </a-checkbox>
          <a-checkbox v-model:checked="compareData">
            {{ $t('tools.data_compare.compare_data') }}
          </a-checkbox>
        </a-space>
      </div>
    </div>

    <div v-if="comparisonResult" class="compare-result">
      <a-tabs>
        <a-tab-pane key="summary" :tab="$t('tools.data_compare.summary')">
          <a-descriptions bordered size="small">
            <a-descriptions-item :label="$t('tools.data_compare.structure_diff')">
              <a-tag :color="comparisonResult.structureDiff > 0 ? 'warning' : 'success'">
                {{ $t('tools.data_compare.diff_count', { n: comparisonResult.structureDiff }) }}
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('tools.data_compare.data_diff')">
              <a-tag :color="comparisonResult.dataDiff > 0 ? 'warning' : 'success'">
                {{ $t('tools.data_compare.diff_rows', { n: comparisonResult.dataDiff }) }}
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item :label="$t('tools.data_compare.missing_rows')">
              {{ comparisonResult.missingRows }}
            </a-descriptions-item>
            <a-descriptions-item :label="$t('tools.data_compare.extra_rows')">
              {{ comparisonResult.extraRows }}
            </a-descriptions-item>
          </a-descriptions>
        </a-tab-pane>

        <a-tab-pane key="structure" :tab="$t('tools.data_compare.structure_diff_tab')">
          <a-empty v-if="!comparisonResult.structureDetails || comparisonResult.structureDetails.length === 0" :description="$t('tools.data_compare.no_structure_diff')" />
          <a-list
            v-else
            :data-source="comparisonResult.structureDetails"
            size="small"
            bordered
          >
            <template #renderItem="{ item }">
              <a-list-item>
                <a-tag color="warning">{{ item.type }}</a-tag>
                {{ item.message }}
              </a-list-item>
            </template>
          </a-list>
        </a-tab-pane>

        <a-tab-pane key="data" :tab="$t('tools.data_compare.data_diff_tab')">
          <a-alert
            v-if="comparisonResult.dataDiff === 0"
            :message="$t('tools.data_compare.data_identical')"
            type="success"
            show-icon
          />
          <div v-else>
            <p>{{ $t('tools.data_compare.found_data_diff', { n: comparisonResult.dataDiff }) }}</p>
            <a-button type="primary" @click="generateSyncScript">
              {{ $t('tools.data_compare.generate_sync') }}
            </a-button>
          </div>
        </a-tab-pane>
      </a-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RetweetOutlined } from '@ant-design/icons-vue'
import { message } from '@/ui/antd'
import { useI18n } from 'vue-i18n'
import { metadataApi, queryApi } from '@/api'
import { useConnectionStore } from '@/stores/connection'
import type { DatabaseInfo, TableInfo, ColumnInfo, DatabaseType } from '@/types/database'

interface StructureDetail {
  type: string
  message: string
}

interface ComparisonResultData {
  structureDiff: number
  dataDiff: number
  missingRows: number
  extraRows: number
  structureDetails: StructureDetail[]
}

const { t } = useI18n()
const connectionStore = useConnectionStore()

const props = defineProps<{
  connectionId: string | null
  initialDatabase?: string | null
}>()

const databases = ref<DatabaseInfo[]>([])
const sourceDatabase = ref('')
const targetDatabase = ref('')
const sourceTable = ref('')
const targetTable = ref('')
const sourceTables = ref<TableInfo[]>([])
const targetTables = ref<TableInfo[]>([])
const comparing = ref(false)
const compareStructure = ref(true)
const compareData = ref(true)
const comparisonResult = ref<ComparisonResultData | null>(null)

const currentConnection = computed(() =>
  props.connectionId ? connectionStore.connections.find(item => item.id === props.connectionId) || null : null
)
const currentDbType = computed<DatabaseType | null>(() => currentConnection.value?.db_type || null)
const selectedSourceTable = computed(() => sourceTables.value.find(table => buildTableKey(table) === sourceTable.value) || null)
const selectedTargetTable = computed(() => targetTables.value.find(table => buildTableKey(table) === targetTable.value) || null)

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

function buildTableIdentifier(table: TableInfo) {
  if (currentDbType.value === 'postgresql') {
    return `${quoteIdentifier(table.schema || 'public')}.${quoteIdentifier(table.name)}`
  }

  return quoteIdentifier(table.name)
}

function resetComparison() {
  comparisonResult.value = null
}

// 加载数据库列表
async function loadDatabases() {
  if (!props.connectionId) return

  try {
    const dbs = await metadataApi.getDatabases(props.connectionId!)
    databases.value = dbs
    if (props.initialDatabase && dbs.some(db => db.name === props.initialDatabase)) {
      sourceDatabase.value = props.initialDatabase
      targetDatabase.value = props.initialDatabase
    } else if (dbs.length === 1) {
      sourceDatabase.value = dbs[0].name
      targetDatabase.value = dbs[0].name
    }
  } catch (error: unknown) {
    message.error(t('tools.data_compare.load_db_fail', { error: String(error) }))
  }
}

// 加载源表列表
watch(sourceDatabase, async (db) => {
  sourceTable.value = ''
  sourceTables.value = []
  resetComparison()
  if (!db || !props.connectionId) return

  try {
    const tables = await metadataApi.getTables(props.connectionId, db)
    sourceTables.value = tables
  } catch (error: unknown) {
    message.error(t('tools.data_compare.load_table_fail', { error: String(error) }))
  }
})

// 加载目标表列表
watch(targetDatabase, async (db) => {
  targetTable.value = ''
  targetTables.value = []
  resetComparison()
  if (!db || !props.connectionId) return

  try {
    const tables = await metadataApi.getTables(props.connectionId, db)
    targetTables.value = tables
  } catch (error: unknown) {
    message.error(t('tools.data_compare.load_table_fail', { error: String(error) }))
  }
})

// 执行比较
async function handleCompare() {
  if (!sourceDatabase.value || !targetDatabase.value || !selectedSourceTable.value || !selectedTargetTable.value) {
    message.warning(t('tools.data_compare.select_required'))
    return
  }

  comparing.value = true

  try {
    // 简化版本的比较逻辑
    const structureDiff: StructureDetail[] = []
    let dataDiff = 0

    if (compareStructure.value) {
      // 比较结构
      const sourceStructure = await metadataApi.getTableStructure({
        connectionId: props.connectionId!,
        table: selectedSourceTable.value.name,
        schema: selectedSourceTable.value.schema || null,
        database: sourceDatabase.value,
      })

      const targetStructure = await metadataApi.getTableStructure({
        connectionId: props.connectionId!,
        table: selectedTargetTable.value.name,
        schema: selectedTargetTable.value.schema || null,
        database: targetDatabase.value,
      })

      // 简单比较列数
      if (sourceStructure.length !== targetStructure.length) {
        structureDiff.push({
          type: t('tools.data_compare.diff_column_count'),
          message: t('tools.data_compare.diff_column_count_msg', { source: sourceStructure.length, target: targetStructure.length }),
        })
      }

      // 比较每一列
      for (const sourceCol of sourceStructure) {
        const targetCol = targetStructure.find((c: ColumnInfo) => c.name === sourceCol.name)
        if (!targetCol) {
          structureDiff.push({
            type: t('tools.data_compare.diff_missing_column'),
            message: t('tools.data_compare.diff_missing_column_msg', { column: sourceCol.name }),
          })
        } else if (sourceCol.data_type !== targetCol.data_type) {
          structureDiff.push({
            type: t('tools.data_compare.diff_type_mismatch'),
            message: t('tools.data_compare.diff_type_mismatch_msg', { column: sourceCol.name, source: sourceCol.data_type, target: targetCol.data_type }),
          })
        }
      }
    }

    if (compareData.value) {
      // 比较数据行数
      const sourceData = await queryApi.executeQuery(
        props.connectionId!,
        `SELECT COUNT(*) AS count FROM ${buildTableIdentifier(selectedSourceTable.value)}`,
        sourceDatabase.value,
      )

      const targetData = await queryApi.executeQuery(
        props.connectionId!,
        `SELECT COUNT(*) AS count FROM ${buildTableIdentifier(selectedTargetTable.value)}`,
        targetDatabase.value,
      )

      const sourceCount = sourceData[0]?.rows?.[0]?.count || 0
      const targetCount = targetData[0]?.rows?.[0]?.count || 0

      dataDiff = Math.abs(Number(sourceCount) - Number(targetCount))
    }

    comparisonResult.value = {
      structureDiff: structureDiff.length,
      dataDiff,
      missingRows: 0,
      extraRows: 0,
      structureDetails: structureDiff,
    }

    message.success(t('tools.data_compare.success'))
  } catch (error: unknown) {
    message.error(t('tools.data_compare.fail', { error: String(error) }))
  } finally {
    comparing.value = false
  }
}

// 生成同步脚本
function generateSyncScript() {
  message.info(t('tools.data_compare.sync_developing'))
}

// 初始化
watch(() => props.connectionId, (id) => {
  databases.value = []
  sourceDatabase.value = ''
  targetDatabase.value = ''
  sourceTable.value = ''
  targetTable.value = ''
  sourceTables.value = []
  targetTables.value = []
  resetComparison()
  if (id) loadDatabases()
}, { immediate: true })

watch([sourceTable, targetTable], () => {
  resetComparison()
})
</script>

<style scoped>
.data-compare {
  padding: 24px;
  height: 100%;
  overflow: auto;
}

.compare-header {
  margin-bottom: 24px;
}

.compare-options {
  margin-top: 16px;
}

.compare-result {
  margin-top: 24px;
}
</style>
