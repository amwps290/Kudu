<template>
  <div class="designer-section">
    <a-space v-if="!readOnly" class="designer-actions">
      <a-button :icon="h(PlusOutlined)" @click="$emit('add')" type="primary">
        {{ $t('designer.add_fk') }}
      </a-button>
    </a-space>

    <a-table
      :columns="readOnly ? displayColumns.filter(c => c.dataIndex !== 'operation') : displayColumns"
      :data-source="foreignKeys"
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
  foreignKeys: any[]
  loading: boolean
  readOnly?: boolean
}>()

defineEmits<{
  add: []
  remove: [record: any]
}>()

const displayColumns = computed(() => [
  { title: t('designer.fk_name'), dataIndex: 'name', key: 'name' },
  { title: t('designer.fk_column'), dataIndex: 'column_name', key: 'column_name' },
  { title: t('designer.ref_table'), dataIndex: 'referenced_table_name', key: 'referenced_table_name' },
  { title: t('designer.ref_column'), dataIndex: 'referenced_column_name', key: 'referenced_column_name' },
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
