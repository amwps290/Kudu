<template>
  <div class="designer-section">
    <a-space v-if="!readOnly" class="designer-actions">
      <a-button :icon="h(PlusOutlined)" @click="$emit('add')" type="primary">
        {{ $t('designer.add_index') }}
      </a-button>
    </a-space>

    <a-table
      :columns="readOnly ? displayColumns.filter(c => c.dataIndex !== 'operation') : displayColumns"
      :data-source="indexes"
      :loading="loading"
      :pagination="false"
      size="small"
      bordered
      row-key="name"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'operation'">
          <a-button
            type="text"
            size="small"
            danger
            :icon="h(DeleteOutlined)"
            @click="$emit('remove', record)"
          >
            {{ $t('common.delete') }}
          </a-button>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { h, computed } from 'vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  indexes: any[]
  loading: boolean
  readOnly?: boolean
}>()

defineEmits<{
  add: []
  remove: [record: any]
}>()

const displayColumns = computed(() => [
  { title: t('designer.index_name'), dataIndex: 'name', key: 'name' },
  { title: t('designer.index_columns'), dataIndex: 'columns', key: 'columns', customRender: ({ text }: any) => Array.isArray(text) ? text.join(', ') : text },
  { title: t('designer.index_type'), dataIndex: 'index_type', key: 'index_type' },
  { title: t('designer.unique'), dataIndex: 'is_unique', key: 'is_unique',
    customRender: ({ text }: any) => text ? t('common.ok') : '-' },
  { title: t('common.delete'), dataIndex: 'operation', width: 100 },
])
</script>

<style scoped>
.designer-section {
  padding: 16px;
}

.designer-actions {
  margin-bottom: 16px;
}
</style>
