<template>
  <a-modal
    v-model:open="visible"
    :title="$t('dialog.save_query.title')"
    width="500px"
    @ok="handleSave"
    @cancel="handleCancel"
    :confirm-loading="saving"
  >
    <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 18 }">
      <a-form-item :label="$t('dialog.save_query.query_name')" required>
        <a-input v-model:value="queryName" :placeholder="$t('dialog.save_query.query_name_placeholder')" />
      </a-form-item>

      <a-form-item :label="$t('dialog.save_query.category')">
        <a-select
          v-model:value="category"
          :placeholder="$t('dialog.save_query.category_placeholder')"
          :options="categoryOptions"
          :show-search="true"
          :allow-clear="true"
        >
          <template #dropdownRender="{ menuNode }">
            <div>
              <div>{{ menuNode }}</div>
              <a-divider class="category-divider" />
              <div class="category-action" @click="showAddCategory = true">
                <PlusOutlined /> {{ $t('dialog.save_query.add_category') }}
              </div>
            </div>
          </template>
        </a-select>
      </a-form-item>

      <a-form-item :label="$t('dialog.save_query.description')">
        <a-textarea v-model:value="description" :placeholder="$t('dialog.save_query.description_placeholder')" :rows="3" />
      </a-form-item>

      <a-form-item :label="$t('dialog.save_query.sql_preview')">
        <div class="sql-preview">
          {{ sqlPreview }}
        </div>
      </a-form-item>
    </a-form>

    <!-- 添加分类对话框 -->
    <a-modal
      v-model:open="showAddCategory"
      :title="$t('dialog.save_query.add_category_title')"
      width="400px"
      @ok="handleAddCategory"
      @cancel="showAddCategory = false"
    >
      <a-input v-model:value="newCategory" :placeholder="$t('dialog.save_query.category_input_placeholder')" />
    </a-modal>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { message } from '@/ui/antd'
import { useI18n } from 'vue-i18n'
import { useDialogModel } from '@/composables/useDialogModel'
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '@/utils/storageService'

interface SavedQuery {
  id: string
  name: string
  sql: string
  category: string
  description: string
  createdAt: number
  updatedAt: number
}

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  sql: string
}>()

const emit = defineEmits(['update:modelValue', 'saved'])

const visible = useDialogModel(props, emit)

const saving = ref(false)
const queryName = ref('')
const category = ref('')
const description = ref('')
const showAddCategory = ref(false)
const newCategory = ref('')

const categories = ref<string[]>([])

const categoryOptions = computed(() => {
  return categories.value.map(cat => ({ label: cat, value: cat }))
})

const sqlPreview = computed(() => {
  if (props.sql.length > 200) {
    return props.sql.substring(0, 200) + '...'
  }
  return props.sql
})

// 加载分类列表
function loadCategories() {
  categories.value = getStorageItem<string[]>(STORAGE_KEYS.QUERY_CATEGORIES, ['常用查询', '数据分析', '报表查询'])
}

// 添加分类
function handleAddCategory() {
  if (!newCategory.value.trim()) {
    message.error(t('dialog.save_query.category_name_required'))
    return
  }

  if (categories.value.includes(newCategory.value)) {
    message.error(t('dialog.save_query.category_exists'))
    return
  }

  categories.value.push(newCategory.value)
  setStorageItem(STORAGE_KEYS.QUERY_CATEGORIES, categories.value)
  category.value = newCategory.value
  newCategory.value = ''
  showAddCategory.value = false
  message.success(t('dialog.save_query.category_added'))
}

// 保存查询
function handleSave() {
  if (!queryName.value.trim()) {
    message.error(t('dialog.save_query.name_required'))
    return
  }

  saving.value = true
  try {
    // 获取已保存的查询
    let queries: SavedQuery[] = getStorageItem<SavedQuery[]>(STORAGE_KEYS.SAVED_QUERIES, [])

    // 创建新查询
    const query: SavedQuery = {
      id: Date.now().toString(),
      name: queryName.value,
      sql: props.sql,
      category: category.value,
      description: description.value,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    queries.unshift(query)

    // 限制数量
    if (queries.length > 200) {
      queries = queries.slice(0, 200)
    }

    setStorageItem(STORAGE_KEYS.SAVED_QUERIES, queries)

    message.success(t('dialog.save_query.success'))
    emit('saved', query)
    handleCancel()
  } catch (error: unknown) {
    message.error(t('dialog.save_query.fail', { error: String(error) }))
  } finally {
    saving.value = false
  }
}

function handleCancel() {
  queryName.value = ''
  category.value = ''
  description.value = ''
  visible.value = false
}

watch(visible, (newVal) => {
  if (newVal) {
    loadCategories()
  }
})
</script>

<style scoped>
.category-divider {
  margin: 4px 0;
}

.category-action {
  padding: 4px 8px;
  cursor: pointer;
}

.sql-preview {
  padding: 8px;
  background: var(--surface-muted);
  border: 1px solid var(--border-color-strong);
  border-radius: var(--radius-sm);
  font-family: monospace;
  font-size: 12px;
  max-height: 150px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
