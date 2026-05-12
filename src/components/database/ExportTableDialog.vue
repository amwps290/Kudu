<template>
  <a-modal
    v-model:open="visible"
    :title="$t('dialog.export_table.title', { table })"
    width="600px"
    @ok="handleExport"
    @cancel="handleCancel"
    :confirm-loading="exporting"
  >
    <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 18 }">
      <a-form-item :label="$t('dialog.export_table.format')" required>
        <a-radio-group v-model:value="exportFormat">
          <a-radio value="csv">CSV</a-radio>
          <a-radio value="json">JSON</a-radio>
          <a-radio value="sql">SQL</a-radio>
        </a-radio-group>
      </a-form-item>

      <a-form-item :label="$t('dialog.export_table.content')">
        <a-radio-group v-model:value="exportType">
          <a-radio value="data">{{ $t('dialog.export_table.data_only') }}</a-radio>
          <a-radio value="structure">{{ $t('dialog.export_table.structure_only') }}</a-radio>
          <a-radio value="both">{{ $t('dialog.export_table.both') }}</a-radio>
        </a-radio-group>
      </a-form-item>

      <a-form-item :label="$t('dialog.export_table.save_path')" required>
        <a-input
          v-model:value="savePath"
          :placeholder="$t('dialog.export_table.save_path_placeholder')"
          readonly
          @click="selectSavePath"
        >
          <template #suffix>
            <FolderOpenOutlined class="save-path-icon" @click="selectSavePath" />
          </template>
        </a-input>
      </a-form-item>

      <a-form-item :label="$t('dialog.export_table.row_limit')">
        <a-input-number
          v-model:value="limit"
          :min="0"
          :placeholder="$t('dialog.export_table.row_limit_placeholder')"
          class="row-limit-input"
        />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { FolderOpenOutlined } from '@ant-design/icons-vue'
import { message } from '@/ui/antd'
import { useI18n } from 'vue-i18n'
import { queryApi, exportApi } from '@/api'
import { save } from '@tauri-apps/plugin-dialog'
import { useDialogModel } from '@/composables/useDialogModel'
import type { QueryResult } from '@/types/database'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  connectionId: string
  database: string
  table: string
}>()

const emit = defineEmits(['update:modelValue', 'exported'])

const visible = useDialogModel(props, emit)

const exporting = ref(false)
const exportFormat = ref('csv')
const exportType = ref('both')
const savePath = ref('')
const limit = ref(0)

async function selectSavePath() {
  const extensions: Record<string, string[]> = {
    csv: ['csv'],
    json: ['json'],
    sql: ['sql'],
  }

  const path = await save({
    defaultPath: `${props.table}.${exportFormat.value}`,
    filters: [{
      name: exportFormat.value.toUpperCase(),
      extensions: extensions[exportFormat.value],
    }],
  })

  if (path) {
    savePath.value = path
  }
}

async function handleExport() {
  if (!savePath.value) {
    message.error(t('dialog.export_table.save_path_required'))
    return
  }

  exporting.value = true
  try {
    // 先查询数据
    let sql = `SELECT * FROM \`${props.table}\``
    if (limit.value > 0) {
      sql += ` LIMIT ${limit.value}`
    }

    const result = await queryApi.executeQuery(
      props.connectionId,
      sql,
      props.database,
    )

    // 根据格式导出
    const data: QueryResult = result[0]
    if (exportFormat.value === 'csv') {
      await exportApi.toCsv(data, savePath.value)
    } else if (exportFormat.value === 'json') {
      await exportApi.toJson(data, savePath.value)
    } else if (exportFormat.value === 'sql') {
      await exportApi.toSql(data, props.table, savePath.value)
    }

    message.success(t('dialog.export_table.success'))
    emit('exported')
    handleCancel()
  } catch (error: unknown) {
    message.error(t('dialog.export_table.fail', { error: String(error) }))
  } finally {
    exporting.value = false
  }
}

function handleCancel() {
  exportFormat.value = 'csv'
  exportType.value = 'both'
  savePath.value = ''
  limit.value = 0
  visible.value = false
}
</script>

<style scoped>
.save-path-icon {
  cursor: pointer;
}

.row-limit-input {
  width: 100%;
}
</style>
