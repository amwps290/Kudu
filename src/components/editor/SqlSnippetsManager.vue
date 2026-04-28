<template>
  <a-modal
    :open="visible"
    :title="$t('dialog.snippets.title')"
    :width="900"
    @cancel="handleCancel"
    :footer="null"
  >
    <div class="snippets-manager">
      <div class="snippets-toolbar">
        <a-space>
          <a-button :icon="h(PlusOutlined)" @click="handleAddSnippet" type="primary">
            {{ $t('dialog.snippets.new_snippet') }}
          </a-button>
          <a-select
            v-model:value="categoryFilter"
            size="small"
            style="width: 160px"
            :options="categoryFilterOptions"
          />
          <a-input-search
            v-model:value="searchText"
            :placeholder="$t('dialog.snippets.search_placeholder')"
            style="width: 200px"
          />
        </a-space>
      </div>

      <div class="snippets-content">
        <div class="snippets-list">
          <a-list
            :data-source="filteredSnippets"
            size="small"
          >
            <template #renderItem="{ item }">
              <a-list-item
                :class="{ active: selectedSnippet?.id === item.id }"
                @click="selectSnippet(item)"
                @dblclick="copySnippet(item)"
                class="snippet-item"
              >
                <a-list-item-meta>
                  <template #title>
                    <div class="snippet-title">
                      {{ item.title }}
                      <a-tag v-if="item.category" size="small" color="blue">
                        {{ item.category }}
                      </a-tag>
                      <a-tag v-if="item.shortcut" size="small">
                        {{ item.shortcut }}
                      </a-tag>
                    </div>
                  </template>
                  <template #description>
                    <div class="snippet-description">{{ item.description || $t('dialog.snippets.no_description') }}</div>
                    <div class="snippet-meta">{{ formatSnippetMeta(item) }}</div>
                  </template>
                </a-list-item-meta>
                <template #actions>
                  <a-button
                    type="text"
                    size="small"
                    :icon="h(CopyOutlined)"
                    @click.stop="copySnippet(item)"
                    :title="$t('common.copy')"
                  />
                  <a-button
                    type="text"
                    size="small"
                    danger
                    :icon="h(DeleteOutlined)"
                    @click.stop="deleteSnippet(item)"
                    :title="$t('common.delete')"
                  />
                </template>
              </a-list-item>
            </template>
          </a-list>
        </div>

        <div class="snippet-editor" v-if="selectedSnippet">
          <a-form :label-col="{ span: 4 }" :wrapper-col="{ span: 20 }">
            <a-form-item :label="$t('dialog.snippets.snippet_title')">
              <a-input v-model:value="selectedSnippet.title" />
            </a-form-item>
            <a-form-item :label="$t('dialog.snippets.category')">
              <a-select
                v-model:value="selectedSnippet.category"
                :options="categoryOptions"
                allow-clear
                :placeholder="$t('dialog.snippets.category_placeholder')"
                mode="tags"
                :max-tag-count="1"
              />
            </a-form-item>
            <a-form-item :label="$t('dialog.snippets.description')">
              <a-textarea v-model:value="selectedSnippet.description" :rows="2" />
            </a-form-item>
            <a-form-item :label="$t('dialog.snippets.sql_code')">
              <a-textarea
                v-model:value="selectedSnippet.sql"
                :rows="10"
                class="sql-input"
                :placeholder="$t('dialog.snippets.sql_placeholder')"
              />
            </a-form-item>
            <a-form-item :label="$t('dialog.snippets.shortcut')">
              <a-input
                v-model:value="selectedSnippet.shortcut"
                :placeholder="$t('dialog.snippets.shortcut_placeholder')"
              />
            </a-form-item>
          </a-form>

          <div class="snippet-actions">
            <a-space>
              <a-button @click="saveSnippet" type="primary">
                <SaveOutlined />
                {{ $t('common.save') }}
              </a-button>
              <a-button @click="insertSnippet">
                {{ $t('common.insert_to_editor') }}
              </a-button>
              <a-button @click="copySnippet(selectedSnippet)">
                <CopyOutlined />
                {{ $t('common.copy') }}
              </a-button>
            </a-space>
          </div>
        </div>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { h, ref, computed, watch } from 'vue'
import {
  PlusOutlined,
  CopyOutlined,
  DeleteOutlined,
  SaveOutlined,
} from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { writeClipboardText } from '@/utils/clipboard'
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '@/utils/storageService'

interface SqlSnippet {
  id: string
  title: string
  description?: string
  category?: string
  sql: string
  shortcut?: string
  createdAt: number
  updatedAt: number
}

const { t } = useI18n()

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits(['update:visible', 'insert'])

const searchText = ref('')
const categoryFilter = ref('__all__')
const selectedSnippet = ref<SqlSnippet | null>(null)
const snippets = ref<SqlSnippet[]>([])

// 默认分类
const builtinCategories = computed(() => [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'DDL',
  t('dialog.snippets.category_common'),
  t('dialog.snippets.category_other'),
])

const availableCategories = computed(() => {
  const categories = new Set<string>()
  builtinCategories.value.forEach((item) => categories.add(item))
  snippets.value.forEach((snippet) => {
    const category = snippet.category?.trim()
    if (category) categories.add(category)
  })
  return Array.from(categories).sort((a, b) => a.localeCompare(b))
})

const categoryOptions = computed(() => availableCategories.value.map((category) => ({
  label: category,
  value: category,
})))

const categoryFilterOptions = computed(() => [
  { label: t('dialog.snippets.all_categories'), value: '__all__' },
  ...availableCategories.value.map((category) => ({
    label: category,
    value: category,
  })),
])

// 预置的代码片段
const defaultSnippets: SqlSnippet[] = [
  {
    id: '1',
    title: 'SELECT Basic Query',
    description: 'Basic SELECT query template',
    category: 'SELECT',
    sql: 'SELECT * FROM table_name\nWHERE condition\nORDER BY column_name\nLIMIT 100;',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: '2',
    title: 'INSERT Data',
    description: 'Insert single row',
    category: 'INSERT',
    sql: 'INSERT INTO table_name (column1, column2, column3)\nVALUES (value1, value2, value3);',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: '3',
    title: 'UPDATE Data',
    description: 'Update table data',
    category: 'UPDATE',
    sql: 'UPDATE table_name\nSET column1 = value1, column2 = value2\nWHERE condition;',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: '4',
    title: 'DELETE Data',
    description: 'Delete table data',
    category: 'DELETE',
    sql: 'DELETE FROM table_name\nWHERE condition;',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: '5',
    title: 'CREATE TABLE',
    description: 'Create table',
    category: 'DDL',
    sql: `CREATE TABLE table_name (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: '6',
    title: 'JOIN Query',
    description: 'Multi-table join query',
    category: 'SELECT',
    sql: `SELECT t1.*, t2.column_name
FROM table1 t1
LEFT JOIN table2 t2 ON t1.id = t2.foreign_id
WHERE t1.condition;`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: '7',
    title: 'GROUP BY',
    description: 'GROUP BY aggregate query',
    category: 'SELECT',
    sql: `SELECT column1, COUNT(*) as count, SUM(column2) as total
FROM table_name
GROUP BY column1
HAVING COUNT(*) > 1
ORDER BY count DESC;`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

// 过滤片段
const filteredSnippets = computed(() => {
  const text = searchText.value.trim().toLowerCase()
  const category = categoryFilter.value

  return snippets.value
    .filter((snippet) => {
      if (category !== '__all__' && (snippet.category || '') !== category) {
        return false
      }
      if (!text) return true
      return snippet.title.toLowerCase().includes(text)
        || snippet.description?.toLowerCase().includes(text)
        || snippet.sql.toLowerCase().includes(text)
        || snippet.shortcut?.toLowerCase().includes(text)
        || snippet.category?.toLowerCase().includes(text)
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
})

// 加载片段
function loadSnippets() {
  const saved = getStorageItem<SqlSnippet[]>(STORAGE_KEYS.CODE_SNIPPETS, [])
  if (saved.length > 0) {
    snippets.value = saved
  } else {
    snippets.value = [...defaultSnippets]
  }
}

// 保存片段到本地存储
function saveToStorage() {
  setStorageItem(STORAGE_KEYS.CODE_SNIPPETS, snippets.value)
}

function formatSnippetMeta(snippet: SqlSnippet) {
  return `${t('dialog.snippets.updated_at')}: ${new Date(snippet.updatedAt).toLocaleString()}`
}

// 添加新片段
function handleAddSnippet() {
  const newSnippet: SqlSnippet = {
    id: Date.now().toString(),
    title: t('dialog.snippets.new_snippet_title'),
    description: '',
    category: '',
    sql: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  snippets.value.unshift(newSnippet)
  selectedSnippet.value = newSnippet
  categoryFilter.value = '__all__'
}

// 选择片段
function selectSnippet(snippet: SqlSnippet) {
  selectedSnippet.value = { ...snippet }
}

// 保存片段
function saveSnippet() {
  if (!selectedSnippet.value) return

  const index = snippets.value.findIndex((s) => s.id === selectedSnippet.value!.id)
  if (index !== -1) {
    selectedSnippet.value.updatedAt = Date.now()
    snippets.value[index] = { ...selectedSnippet.value }
    saveToStorage()
    message.success(t('dialog.snippets.save_success'))
  }
}

// 删除片段
function deleteSnippet(snippet: SqlSnippet) {
  Modal.confirm({
    title: t('dialog.snippets.delete_confirm_title'),
    content: t('dialog.snippets.delete_confirm_content', { title: snippet.title }),
    okText: t('common.delete'),
    okType: 'danger',
    cancelText: t('common.cancel'),
    onOk() {
      snippets.value = snippets.value.filter((s) => s.id !== snippet.id)
      if (selectedSnippet.value?.id === snippet.id) {
        selectedSnippet.value = null
      }
      saveToStorage()
      message.success(t('dialog.snippets.delete_success'))
    },
  })
}

// 复制片段到系统剪贴板
async function copySnippet(snippet: SqlSnippet | null = selectedSnippet.value) {
  if (!snippet) return
  await writeClipboardText(snippet.sql)
  message.success(t('dialog.snippets.copy_success'))
}

// 插入片段到 SQL 编辑器
function insertSnippet() {
  if (!selectedSnippet.value) return
  emit('insert', selectedSnippet.value.sql)
  message.success(t('dialog.snippets.insert_success'))
  emit('update:visible', false)
}

// 取消
function handleCancel() {
  emit('update:visible', false)
}

// 监听对话框打开
watch(() => props.visible, (visible) => {
  if (visible) {
    loadSnippets()
    categoryFilter.value = '__all__'
    if (!selectedSnippet.value && snippets.value.length > 0) {
      selectedSnippet.value = { ...filteredSnippets.value[0] }
    }
  }
})
</script>

<style scoped>
.snippets-manager {
  height: 600px;
  display: flex;
  flex-direction: column;
}

.snippets-toolbar {
  padding: 12px;
  border-bottom: 1px solid #e8e8e8;
}

.dark-mode .snippets-toolbar {
  border-bottom-color: #303030;
}

.snippets-content {
  display: flex;
  gap: 16px;
  flex: 1;
  overflow: hidden;
  padding: 16px;
}

.snippets-list {
  width: 300px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  overflow-y: auto;
}

.dark-mode .snippets-list {
  border-color: #303030;
}

.snippet-item {
  cursor: pointer;
  transition: background-color 0.2s;
  padding: 12px !important;
}

.snippet-item:hover {
  background-color: #f5f5f5;
}

.dark-mode .snippet-item:hover {
  background-color: #262626;
}

.snippet-item.active {
  background-color: #e6f7ff;
}

.dark-mode .snippet-item.active {
  background-color: #111b26;
}

.snippet-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.snippet-description {
  margin-bottom: 4px;
}

.snippet-meta {
  font-size: 12px;
  color: #8c8c8c;
}

.snippet-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.sql-input {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
}

.snippet-actions {
  padding-top: 12px;
  border-top: 1px solid #e8e8e8;
}

.dark-mode .snippet-actions {
  border-top-color: #303030;
}

.dark-mode .snippet-meta {
  color: #a6a6a6;
}
</style>
