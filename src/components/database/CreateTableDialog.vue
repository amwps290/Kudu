<template>
  <a-modal
    v-model:open="visible"
    :title="$t('dialog.create_table.title')"
    width="900px"
    @ok="handleCreate"
    @cancel="handleCancel"
    :confirm-loading="creating"
  >
    <a-form :label-col="{ span: 4 }" :wrapper-col="{ span: 20 }">
      <a-form-item :label="$t('dialog.create_table.table_name')" required>
        <a-input v-model:value="tableName" :placeholder="$t('dialog.create_table.table_name_placeholder')" />
      </a-form-item>

      <a-form-item :label="$t('dialog.create_table.charset')">
        <a-select v-model:value="charset" :placeholder="$t('dialog.create_table.charset_placeholder')">
          <a-select-option value="utf8mb4">utf8mb4</a-select-option>
          <a-select-option value="utf8">utf8</a-select-option>
          <a-select-option value="latin1">latin1</a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item :label="$t('dialog.create_table.engine')">
        <a-select v-model:value="engine" :placeholder="$t('dialog.create_table.engine_placeholder')">
          <a-select-option value="InnoDB">InnoDB</a-select-option>
          <a-select-option value="MyISAM">MyISAM</a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item :label="$t('dialog.create_table.table_comment')">
        <a-input v-model:value="comment" :placeholder="$t('dialog.create_table.table_comment_placeholder')" />
      </a-form-item>

      <a-divider>{{ $t('dialog.create_table.column_definition') }}</a-divider>

      <a-button type="dashed" block @click="addColumn" class="add-column-btn">
        <PlusOutlined />
        {{ $t('dialog.create_table.add_column') }}
      </a-button>

      <a-table
        :columns="columnTableColumns"
        :data-source="columns"
        :pagination="false"
        size="small"
        bordered
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'name'">
            <a-input v-model:value="record.name" :placeholder="$t('dialog.create_table.column_name_placeholder')" size="small" />
          </template>
          <template v-else-if="column.key === 'type'">
            <a-select v-model:value="record.type" size="small" class="column-type-select">
              <a-select-option value="INT">INT</a-select-option>
              <a-select-option value="BIGINT">BIGINT</a-select-option>
              <a-select-option value="VARCHAR">VARCHAR</a-select-option>
              <a-select-option value="TEXT">TEXT</a-select-option>
              <a-select-option value="DATETIME">DATETIME</a-select-option>
              <a-select-option value="TIMESTAMP">TIMESTAMP</a-select-option>
              <a-select-option value="DECIMAL">DECIMAL</a-select-option>
              <a-select-option value="BOOLEAN">BOOLEAN</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'length'">
            <a-input v-model:value="record.length" :placeholder="$t('dialog.create_table.column_length_placeholder')" size="small" />
          </template>
          <template v-else-if="column.key === 'nullable'">
            <a-checkbox v-model:checked="record.nullable" />
          </template>
          <template v-else-if="column.key === 'primary'">
            <a-checkbox v-model:checked="record.primary" />
          </template>
          <template v-else-if="column.key === 'autoIncrement'">
            <a-checkbox v-model:checked="record.autoIncrement" />
          </template>
          <template v-else-if="column.key === 'defaultValue'">
            <a-input v-model:value="record.defaultValue" :placeholder="$t('dialog.create_table.column_default_placeholder')" size="small" />
          </template>
          <template v-else-if="column.key === 'comment'">
            <a-input v-model:value="record.comment" :placeholder="$t('dialog.create_table.column_comment_placeholder')" size="small" />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" danger size="small" @click="removeColumn(index)">
              {{ $t('common.delete') }}
            </a-button>
          </template>
        </template>
      </a-table>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { message } from '@/ui/antd'
import { useI18n } from 'vue-i18n'
import { queryApi } from '@/api'
import { useDialogModel } from '@/composables/useDialogModel'

interface Column {
  name: string
  type: string
  length: string
  nullable: boolean
  primary: boolean
  autoIncrement: boolean
  defaultValue: string
  comment: string
}

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  connectionId: string
  database: string
}>()

const emit = defineEmits(['update:modelValue', 'created'])

const visible = useDialogModel(props, emit)

const creating = ref(false)
const tableName = ref('')
const charset = ref('utf8mb4')
const engine = ref('InnoDB')
const comment = ref('')
const columns = ref<Column[]>([])

const columnTableColumns = computed(() => [
  { title: t('dialog.create_table.column_name'), key: 'name', width: 120 },
  { title: t('dialog.create_table.column_type'), key: 'type', width: 100 },
  { title: t('dialog.create_table.column_length'), key: 'length', width: 80 },
  { title: t('dialog.create_table.column_nullable'), key: 'nullable', width: 70 },
  { title: t('dialog.create_table.column_primary'), key: 'primary', width: 60 },
  { title: t('dialog.create_table.column_auto_increment'), key: 'autoIncrement', width: 60 },
  { title: t('dialog.create_table.column_default'), key: 'defaultValue', width: 100 },
  { title: t('dialog.create_table.column_comment'), key: 'comment', width: 120 },
  { title: t('common.operation'), key: 'action', width: 80 },
])

function addColumn() {
  columns.value.push({
    name: '',
    type: 'VARCHAR',
    length: '255',
    nullable: true,
    primary: false,
    autoIncrement: false,
    defaultValue: '',
    comment: '',
  })
}

function removeColumn(index: number) {
  columns.value.splice(index, 1)
}

function generateCreateTableSql(): string {
  if (!tableName.value || columns.value.length === 0) {
    return ''
  }

  const columnDefs = columns.value.map(col => {
    let def = `\`${col.name}\` ${col.type}`

    if (col.length && ['VARCHAR', 'CHAR', 'DECIMAL'].includes(col.type)) {
      def += `(${col.length})`
    }

    if (!col.nullable) {
      def += ' NOT NULL'
    }

    if (col.autoIncrement) {
      def += ' AUTO_INCREMENT'
    }

    if (col.defaultValue) {
      def += ` DEFAULT '${col.defaultValue}'`
    }

    if (col.comment) {
      def += ` COMMENT '${col.comment}'`
    }

    return def
  })

  const primaryKeys = columns.value.filter(col => col.primary).map(col => col.name)
  if (primaryKeys.length > 0) {
    columnDefs.push(`PRIMARY KEY (\`${primaryKeys.join('`, `')}\`)`)
  }

  let sql = `CREATE TABLE \`${tableName.value}\` (\n  ${columnDefs.join(',\n  ')}\n)`

  sql += ` ENGINE=${engine.value} DEFAULT CHARSET=${charset.value}`

  if (comment.value) {
    sql += ` COMMENT='${comment.value}'`
  }

  return sql
}

async function handleCreate() {
  if (!tableName.value.trim()) {
    message.error(t('dialog.create_table.table_name_required'))
    return
  }

  if (columns.value.length === 0) {
    message.error(t('dialog.create_table.column_required'))
    return
  }

  // 验证字段名
  for (const col of columns.value) {
    if (!col.name.trim()) {
      message.error(t('dialog.create_table.column_name_required'))
      return
    }
  }

  creating.value = true
  try {
    const sql = generateCreateTableSql()

    await queryApi.executeQuery(props.connectionId, sql, props.database)

    message.success(t('dialog.create_table.success'))
    emit('created')
    handleCancel()
  } catch (error: unknown) {
    message.error(t('dialog.create_table.fail', { error: String(error) }))
  } finally {
    creating.value = false
  }
}

function handleCancel() {
  tableName.value = ''
  charset.value = 'utf8mb4'
  engine.value = 'InnoDB'
  comment.value = ''
  columns.value = []
  visible.value = false
}

// 初始化一个默认字段
watch(visible, (newVal) => {
  if (newVal && columns.value.length === 0) {
    addColumn()
    columns.value[0].name = 'id'
    columns.value[0].type = 'INT'
    columns.value[0].primary = true
    columns.value[0].autoIncrement = true
    columns.value[0].nullable = false
  }
})
</script>

<style scoped>
.add-column-btn {
  margin-bottom: 12px;
}

.column-type-select {
  width: 100%;
}

:deep(.ant-table) {
  font-size: 12px;
}
</style>
