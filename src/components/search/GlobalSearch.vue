<template>
  <a-modal
    :open="visible"
    :title="$t('search.title')"
    :width="1000"
    @cancel="handleCancel"
    :footer="null"
  >
    <div class="global-search">
      <div class="section-header search-header">
        <a-input-search
          v-model:value="searchText"
          :placeholder="$t('search.placeholder')"
          size="large"
          @search="handleSearch"
          :loading="searching"
          allow-clear
          autofocus
        >
          <template #enterButton>
            <a-button type="primary">
              <SearchOutlined />
              {{ $t('search.button') }}
            </a-button>
          </template>
        </a-input-search>

        <div class="search-filters search-filters-spaced">
          <a-space>
            <a-select
              v-model:value="searchScope"
              class="search-filter-select"
              :placeholder="$t('search.scope')"
            >
              <a-select-option value="all">{{ $t('search.scope_all') }}</a-select-option>
              <a-select-option value="tables">{{ $t('search.scope_tables') }}</a-select-option>
              <a-select-option value="columns">{{ $t('search.scope_columns') }}</a-select-option>
              <a-select-option value="views">{{ $t('search.scope_views') }}</a-select-option>
              <a-select-option v-if="!isPostgreSQL" value="procedures">{{ $t('search.scope_procedures') }}</a-select-option>
              <a-select-option value="functions">{{ $t('search.scope_functions') }}</a-select-option>
            </a-select>

            <a-select
              v-model:value="selectedDatabase"
              class="search-filter-select"
              :placeholder="$t('search.select_database')"
              allow-clear
            >
              <a-select-option value="">{{ $t('search.all_databases') }}</a-select-option>
              <a-select-option
                v-for="db in databases"
                :key="db.name"
                :value="db.name"
              >
                {{ db.name }}
              </a-select-option>
            </a-select>

            <a-checkbox v-model:checked="caseSensitive">
              {{ $t('search.case_sensitive') }}
            </a-checkbox>
          </a-space>
        </div>
      </div>

      <div class="search-results" v-if="searchResults.length > 0">
        <div class="text-subtle results-summary">
          {{ $t('search.results_found') }} <strong>{{ searchResults.length }}</strong> {{ $t('search.results_count') }}
        </div>

        <a-tabs v-model:activeKey="activeTab">
          <a-tab-pane
            v-for="type in resultTypes"
            :key="type.key"
            :tab="`${type.label} (${getResultCount(type.key)})`"
          >
            <a-list
              :data-source="getResultsByType(type.key)"
              :pagination="{ pageSize: 20 }"
            >
              <template #renderItem="{ item }">
                <a-list-item>
                  <a-list-item-meta>
                    <template #avatar>
                      <component :is="getIcon(item.type)" class="result-icon" />
                    </template>
                    <template #title>
                      <a @click="handleResultClick(item)">
                        <span v-html="highlightMatch(item.name)"></span>
                      </a>
                      <a-tag
                        v-if="item.database"
                        color="blue"
                        size="small"
                        class="result-tag result-tag-database"
                      >
                        {{ item.database }}
                      </a-tag>
                      <a-tag
                        v-if="item.table"
                        color="green"
                        size="small"
                        class="result-tag result-tag-table"
                      >
                        {{ item.table }}
                      </a-tag>
                    </template>
                    <template #description>
                      <div>
                        <span v-if="item.type">{{ getTypeName(item.type) }}</span>
                        <span v-if="item.dataType"> • {{ $t('search.type_prefix') }}: {{ item.dataType }}</span>
                        <span v-if="item.comment"> • {{ item.comment }}</span>
                      </div>
                    </template>
                  </a-list-item-meta>
                  <template #actions>
                    <a-button
                      type="link"
                      size="small"
                      @click="handleCopyPath(item)"
                    >
                      <CopyOutlined />
                      {{ $t('common.copy_path') }}
                    </a-button>
                    <a-button
                      v-if="item.type === 'table'"
                      type="link"
                      size="small"
                      @click="handleViewData(item)"
                    >
                      <TableOutlined />
                      {{ $t('tree.view_data') }}
                    </a-button>
                  </template>
                </a-list-item>
              </template>
            </a-list>
          </a-tab-pane>
        </a-tabs>
      </div>

      <a-empty
        v-else-if="!searching && searchText"
        :description="$t('search.no_results')"
      />
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import {
  SearchOutlined,
  CopyOutlined,
  TableOutlined,
  EyeOutlined,
  FileOutlined,
  FolderOutlined,
} from '@ant-design/icons-vue'
import { message } from '@/ui/antd'
import { useI18n } from 'vue-i18n'
import { metadataApi } from '@/api'
import type { DatabaseInfo } from '@/types/database'
import { writeClipboardText } from '@/utils/clipboard'

interface SearchResult {
  type: 'table' | 'column' | 'view' | 'procedure' | 'function' | 'trigger'
  name: string
  database?: string
  table?: string
  dataType?: string
  comment?: string
}

const { t } = useI18n()
const connectionStore = useConnectionStore()
const currentConnection = computed(() => props.connectionId ? connectionStore.connections.find(conn => conn.id === props.connectionId) || null : null)
const isPostgreSQL = computed(() => (currentConnection.value?.db_type || '').toLowerCase() === 'postgresql')

const props = defineProps<{
  visible: boolean
  connectionId: string | null
}>()

const emit = defineEmits(['update:visible', 'view-data', 'design-table'])

const searchText = ref('')
const searching = ref(false)
const searchScope = ref('all')
const selectedDatabase = ref('')
const caseSensitive = ref(false)
const searchResults = ref<SearchResult[]>([])
const databases = ref<DatabaseInfo[]>([])
const activeTab = ref('all')

const resultTypes = computed(() => [
  { key: 'all', label: t('search.scope_all') },
  { key: 'table', label: t('search.scope_tables') },
  { key: 'column', label: t('search.scope_columns') },
  { key: 'view', label: t('search.scope_views') },
  ...(isPostgreSQL.value ? [] : [{ key: 'procedure', label: t('search.scope_procedures') }]),
  { key: 'function', label: t('search.scope_functions') },
])

// 获取图标
function getIcon(type: string) {
  const iconMap: Record<string, typeof TableOutlined> = {
    table: TableOutlined,
    column: FileOutlined,
    view: EyeOutlined,
    procedure: FolderOutlined,
    function: FolderOutlined,
    trigger: FolderOutlined,
  }
  return iconMap[type] || FileOutlined
}

// 获取类型名称
function getTypeName(type: string): string {
  const keyMap: Record<string, string> = {
    table: 'search.type_table',
    column: 'search.type_column',
    view: 'search.type_view',
    procedure: 'search.type_procedure',
    function: 'search.type_function',
    trigger: 'search.type_trigger',
  }
  return keyMap[type] ? t(keyMap[type]) : type
}

// 获取指定类型的结果数量
function getResultCount(type: string): number {
  if (type === 'all') return searchResults.value.length
  return searchResults.value.filter(r => r.type === type).length
}

// 获取指定类型的结果
function getResultsByType(type: string): SearchResult[] {
  if (type === 'all') return searchResults.value
  return searchResults.value.filter(r => r.type === type)
}

// 高亮匹配文本
function highlightMatch(text: string): string {
  if (!searchText.value) return text

  const regex = new RegExp(
    `(${searchText.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
    caseSensitive.value ? 'g' : 'gi'
  )

  return text.replace(regex, '<span class="global-search-highlight">$1</span>')
}

// 加载数据库列表
async function loadDatabases() {
  if (!props.connectionId) return

  try {
    const dbs = await metadataApi.getDatabases(props.connectionId!)
    databases.value = dbs
  } catch (error: unknown) {
    console.error('Failed to load databases:', error)
  }
}

// 执行搜索
async function handleSearch() {
  if (!searchText.value || !props.connectionId) {
    message.warning(t('search.input_required'))
    return
  }

  searching.value = true
  searchResults.value = []

  try {
    const results: SearchResult[] = []
    const searchPattern = caseSensitive.value ? searchText.value : searchText.value.toLowerCase()

    // 确定要搜索的数据库列表
    const databasesToSearch = selectedDatabase.value
      ? [{ name: selectedDatabase.value }]
      : databases.value

    for (const db of databasesToSearch) {
      // 搜索表
      if (searchScope.value === 'all' || searchScope.value === 'tables') {
        const tables = await metadataApi.getTables(props.connectionId!, db.name)

        for (const table of tables) {
          const tableName = caseSensitive.value ? table.name : table.name.toLowerCase()
          if (tableName.includes(searchPattern)) {
            results.push({
              type: 'table',
              name: table.name,
              database: db.name,
              comment: table.comment,
            })
          }
        }
      }

      // 搜索列
      if (searchScope.value === 'all' || searchScope.value === 'columns') {
        const tables = await metadataApi.getTables(props.connectionId!, db.name)

        for (const table of tables) {
          const columns = await metadataApi.getTableStructure({
            connectionId: props.connectionId!,
            table: table.name,
            schema: table.schema || db.name,
            database: db.name,
          })

          for (const column of columns) {
            const columnName = caseSensitive.value ? column.name : column.name.toLowerCase()
            if (columnName.includes(searchPattern)) {
              results.push({
                type: 'column',
                name: column.name,
                database: db.name,
                table: table.name,
                dataType: column.data_type,
                comment: column.comment,
              })
            }
          }
        }
      }

      // 搜索视图
      if (searchScope.value === 'all' || searchScope.value === 'views') {
        try {
          const views = await metadataApi.getViews(props.connectionId!, db.name)

          for (const view of views) {
            const viewName = caseSensitive.value ? view.name : view.name.toLowerCase()
            if (viewName.includes(searchPattern)) {
              results.push({
                type: 'view',
                name: view.name,
                database: db.name,
                comment: view.comment,
              })
            }
          }
        } catch (error) {
          console.error('Failed to search views:', error)
        }
      }

      // 搜索存储过程（MySQL 等支持的数据库）
      if (!isPostgreSQL.value && (searchScope.value === 'all' || searchScope.value === 'procedures')) {
        try {
          const procedures = await metadataApi.getProcedures(props.connectionId!, db.name)

          for (const proc of procedures) {
            const procName = caseSensitive.value ? proc.ROUTINE_NAME : proc.ROUTINE_NAME.toLowerCase()
            if (procName.includes(searchPattern)) {
              results.push({
                type: 'procedure',
                name: proc.ROUTINE_NAME,
                database: db.name,
              })
            }
          }
        } catch (error) {
          console.error('Failed to search procedures:', error)
        }
      }

      // 搜索函数
      if (searchScope.value === 'all' || searchScope.value === 'functions') {
        try {
          const functions = await metadataApi.getFunctions(props.connectionId!, db.name)

          for (const func of functions) {
            const funcName = caseSensitive.value ? func.ROUTINE_NAME : func.ROUTINE_NAME.toLowerCase()
            if (funcName.includes(searchPattern)) {
              results.push({
                type: 'function',
                name: func.ROUTINE_NAME,
                database: db.name,
              })
            }
          }
        } catch (error) {
          console.error('Failed to search functions:', error)
        }
      }
    }

    searchResults.value = results

    if (results.length === 0) {
      message.info(t('search.no_results_message'))
    } else {
      message.success(t('search.results_success', { n: results.length }))
    }
  } catch (error: unknown) {
    message.error(t('search.fail', { error: String(error) }))
  } finally {
    searching.value = false
  }
}

// 处理结果点击
function handleResultClick(item: SearchResult) {
  if (item.type === 'table' || item.type === 'view') {
    emit('view-data', {
      database: item.database,
      table: item.name,
    })
  }
}

// 查看数据
function handleViewData(item: SearchResult) {
  emit('view-data', {
    database: item.database,
    table: item.name,
  })
  emit('update:visible', false)
}

// 复制路径
async function handleCopyPath(item: SearchResult) {
  let path = ''
  if (item.table) {
    path = `${item.database}.${item.table}.${item.name}`
  } else {
    path = `${item.database}.${item.name}`
  }

  await writeClipboardText(path)
  message.success(t('search.path_copied'))
}

// 取消
function handleCancel() {
  emit('update:visible', false)
}

// 监听对话框打开
watch(() => props.visible, (visible) => {
  if (visible) {
    loadDatabases()
    searchResults.value = []
    activeTab.value = 'all'
  }
})
</script>

<style scoped>
.global-search {
  min-height: 500px;
}

.search-header {
  margin-bottom: 24px;
}

.search-filters {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-filters-spaced {
  margin-top: 12px;
}

.search-filter-select {
  width: 150px;
}

.results-summary {
  padding: 12px 0;
  font-size: 14px;
}

.search-results {
  margin-top: 16px;
}

.result-icon {
  font-size: 20px;
  color: var(--color-primary);
}

.result-tag-database {
  margin-left: 8px;
}

.result-tag-table {
  margin-left: 4px;
}

:deep(.global-search-highlight) {
  background-color: var(--color-warning-soft-bg);
  color: var(--app-text);
  font-weight: 700;
}

:deep(.ant-list-item-meta-title) a {
  color: inherit;
}

:deep(.ant-list-item-meta-title) a:hover {
  color: var(--color-primary);
}
</style>
