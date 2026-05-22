<template>
  <a-table
    :columns="columnEditorColumns"
    :data-source="columns"
    :loading="loading"
    :pagination="false"
    :scroll="{ x: 'max-content', y: 'calc(100vh - 250px)' }"
    size="small"
    bordered
    row-key="name"
  >
    <template #bodyCell="{ column, record, index }">
      <!-- 只读模式下的单元格渲染 -->
      <template v-if="readOnly && column.dataIndex !== 'operation'">
        <span v-if="column.dataIndex === 'nullable'">
          <a-checkbox :checked="record.nullable" disabled />
        </span>
        <span v-else-if="column.dataIndex === 'is_primary_key'">
          <a-checkbox :checked="record.is_primary_key" disabled />
        </span>
        <span v-else-if="column.dataIndex === 'is_auto_increment'">
          <a-checkbox :checked="record.is_auto_increment" disabled />
        </span>
        <span v-else>{{ typeof column.dataIndex === 'string' ? record[column.dataIndex] : '' }}</span>
      </template>

      <!-- 编辑模式下的单元格渲染 -->
      <template v-else-if="!readOnly">
        <!-- 列名 -->
        <template v-if="column.dataIndex === 'name'">
          <a-input
            v-model:value="record.name"
            size="small"
            :placeholder="$t('designer.column_name')"
            @change="record._modified = true"
          />
        </template>

        <!-- 数据类型 -->
        <template v-else-if="column.dataIndex === 'data_type'">
          <a-select
            v-model:value="record.data_type"
            size="small"
            class="column-full-width"
            @change="record._modified = true"
          >
            <a-select-option v-for="type in dataTypes" :key="type" :value="type">
              {{ type }}
            </a-select-option>
          </a-select>
        </template>

        <!-- 长度 -->
        <template v-else-if="column.dataIndex === 'length'">
          <a-input-number
            v-model:value="record.length"
            size="small"
            :min="1"
            class="column-full-width"
            @change="record._modified = true"
          />
        </template>

        <!-- 可空 -->
        <template v-else-if="column.dataIndex === 'nullable'">
          <a-checkbox
            v-model:checked="record.nullable"
            @change="record._modified = true"
          />
        </template>

        <!-- 主键 -->
        <template v-else-if="column.dataIndex === 'is_primary_key'">
          <a-checkbox
            v-model:checked="record.is_primary_key"
            @change="handlePrimaryKeyChange(record)"
          />
        </template>

        <!-- 自增 -->
        <template v-else-if="column.dataIndex === 'is_auto_increment'">
          <a-checkbox
            v-model:checked="record.is_auto_increment"
            @change="record._modified = true"
          />
        </template>

        <!-- 默认值 -->
        <template v-else-if="column.dataIndex === 'default_value'">
          <a-input
            v-model:value="record.default_value"
            size="small"
            :placeholder="$t('designer.default_value_placeholder')"
            @change="record._modified = true"
          />
        </template>

        <!-- 注释 -->
        <template v-else-if="column.dataIndex === 'comment'">
          <a-input
            v-model:value="record.comment"
            size="small"
            :placeholder="$t('designer.comment')"
            @change="record._modified = true"
          />
        </template>

        <!-- 操作 -->
        <template v-else-if="column.dataIndex === 'operation'">
          <a-space>
            <a-button
              type="text"
              size="small"
              danger
              :icon="h(DeleteOutlined)"
              @click="$emit('remove', index)"
            />
            <a-button
              type="text"
              size="small"
              :icon="h(ArrowUpOutlined)"
              @click="$emit('move', index, -1)"
              :disabled="index === 0"
            />
            <a-button
              type="text"
              size="small"
              :icon="h(ArrowDownOutlined)"
              @click="$emit('move', index, 1)"
              :disabled="index === columns.length - 1"
            />
          </a-space>
        </template>
      </template>
    </template>
  </a-table>
</template>

<script setup lang="ts">
import { h, computed } from 'vue'
import {
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  columns: any[]
  loading: boolean
  readOnly?: boolean
}>()

defineEmits<{
  remove: [index: number]
  move: [index: number, direction: number]
}>()

const dataTypes = [
  'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
  'VARCHAR', 'CHAR', 'TEXT', 'LONGTEXT', 'MEDIUMTEXT',
  'DECIMAL', 'FLOAT', 'DOUBLE',
  'DATE', 'DATETIME', 'TIMESTAMP', 'TIME',
  'BOOLEAN', 'BOOL',
  'JSON',
  'BLOB', 'LONGBLOB',
]

const columnEditorColumns = computed(() => [
  { title: t('designer.column_name'), dataIndex: 'name', width: 150 },
  { title: t('designer.data_type'), dataIndex: 'data_type', width: 120 },
  { title: t('designer.length'), dataIndex: 'length', width: 80 },
  { title: t('designer.nullable'), dataIndex: 'nullable', width: 60 },
  { title: t('designer.pk'), dataIndex: 'is_primary_key', width: 60 },
  { title: t('designer.auto_increment'), dataIndex: 'is_auto_increment', width: 60 },
  { title: t('designer.default_value'), dataIndex: 'default_value', width: 120 },
  { title: t('designer.comment'), dataIndex: 'comment', width: 200 },
  { title: t('common.view'), dataIndex: 'operation', width: 120, fixed: 'right' as const },
])

function handlePrimaryKeyChange(record: any) {
  record._modified = true
  if (record.is_primary_key) record.nullable = false
}
</script>

<style scoped>
.column-full-width {
  width: 100%;
}
</style>
