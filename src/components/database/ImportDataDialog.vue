<template>
  <a-modal
    v-model:open="visible"
    :title="$t('dialog.import_data.title', { table })"
    width="600px"
    @ok="handleImport"
    @cancel="handleCancel"
    :confirm-loading="importing"
  >
    <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 18 }">
      <a-form-item :label="$t('dialog.import_data.file_format')" required>
        <a-radio-group v-model:value="importFormat">
          <a-radio value="csv">CSV</a-radio>
          <a-radio value="json">JSON</a-radio>
          <a-radio value="sql">SQL</a-radio>
        </a-radio-group>
      </a-form-item>

      <a-form-item :label="$t('dialog.import_data.select_file')" required>
        <a-input
          v-model:value="filePath"
          :placeholder="$t('dialog.import_data.select_file_placeholder')"
          readonly
          @click="selectFile"
        >
          <template #suffix>
            <FileOutlined style="cursor: pointer" @click="selectFile" />
          </template>
        </a-input>
      </a-form-item>

      <a-form-item :label="$t('dialog.import_data.import_mode')">
        <a-radio-group v-model:value="importMode">
          <a-radio value="insert">{{ $t('dialog.import_data.mode_insert') }}</a-radio>
          <a-radio value="replace">{{ $t('dialog.import_data.mode_replace') }}</a-radio>
          <a-radio value="truncate">{{ $t('dialog.import_data.mode_truncate') }}</a-radio>
        </a-radio-group>
      </a-form-item>

      <a-form-item v-if="importFormat === 'csv'" :label="$t('dialog.import_data.delimiter')">
        <a-input v-model:value="delimiter" :placeholder="$t('dialog.import_data.delimiter_placeholder')" />
      </a-form-item>

      <a-form-item v-if="importFormat === 'csv'" :label="$t('dialog.import_data.has_header')">
        <a-switch v-model:checked="hasHeader" />
      </a-form-item>
    </a-form>

    <a-alert
      v-if="importMode === 'truncate'"
      :message="$t('common.warning')"
      :description="$t('dialog.import_data.truncate_warning')"
      type="warning"
      show-icon
      style="margin-top: 12px"
    />
  </a-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { FileOutlined } from '@ant-design/icons-vue'
import { message, Modal } from '@/ui/antd'
import { useI18n } from 'vue-i18n'
import { queryApi, metadataApi, dataApi, utilsApi } from '@/api'
import { open } from '@tauri-apps/plugin-dialog'
import { useDialogModel } from '@/composables/useDialogModel'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  connectionId: string
  database: string
  table: string
  schema?: string
}>()

const emit = defineEmits(['update:modelValue', 'imported'])

const visible = useDialogModel(props, emit)

const importing = ref(false)
const importFormat = ref('csv')
const importMode = ref('insert')
const filePath = ref('')
const delimiter = ref(',')
const hasHeader = ref(true)

async function selectFile() {
  const extensions: Record<string, string[]> = {
    csv: ['csv'],
    json: ['json'],
    sql: ['sql'],
  }

  const path = await open({
    filters: [{
      name: importFormat.value.toUpperCase(),
      extensions: extensions[importFormat.value],
    }],
    multiple: false,
  })

  if (path) {
    filePath.value = path as string
  }
}

async function handleImport() {
  if (!filePath.value) {
    message.error(t('dialog.import_data.file_required'))
    return
  }

  if (importMode.value === 'truncate') {
    Modal.confirm({
      title: t('dialog.import_data.confirm_truncate_title'),
      content: t('dialog.import_data.confirm_truncate_content'),
      okText: t('common.ok'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        await doImport()
      },
    })
  } else {
    await doImport()
  }
}

async function doImport() {
  importing.value = true
  try {
    // 如果是清空模式，先清空表
    if (importMode.value === 'truncate') {
      await dataApi.truncateTable({
        connectionId: props.connectionId,
        table: props.table,
        database: props.database,
        schema: props.schema,
      })
    }

    // 读取文件内容
    const fileContent = await utilsApi.readFile(filePath.value)

    // 根据格式解析并导入
    if (importFormat.value === 'csv') {
      await importFromCSV(fileContent)
    } else if (importFormat.value === 'json') {
      await importFromJSON(fileContent)
    } else if (importFormat.value === 'sql') {
      await importFromSQL(fileContent)
    }

    message.success(t('dialog.import_data.success'))
    emit('imported')
    handleCancel()
  } catch (error: unknown) {
    message.error(t('dialog.import_data.fail', { error: String(error) }))
  } finally {
    importing.value = false
  }
}

async function importFromCSV(content: string) {
  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length === 0) return

  let headers: string[] = []
  let startIndex = 0

  if (hasHeader.value) {
    headers = lines[0].split(delimiter.value).map(h => h.trim().replace(/^"|"$/g, ''))
    startIndex = 1
  } else {
    // 如果没有表头，使用表的列名
    const columns = await metadataApi.getTableStructure({
      connectionId: props.connectionId,
      table: props.table,
      schema: props.schema,
      database: props.database,
    }) as { name: string }[]
    headers = columns.map(col => col.name)
  }

  // 批量插入数据
  for (let i = startIndex; i < lines.length; i++) {
    const values = lines[i].split(delimiter.value).map(v => v.trim().replace(/^"|"$/g, ''))
    const data: Record<string, string> = {}

    headers.forEach((header, index) => {
      if (values[index] !== undefined && values[index] !== '') {
        data[header] = values[index]
      }
    })

    await dataApi.insertTableData({
      connectionId: props.connectionId,
      database: props.database,
      table: props.table,
      schema: props.schema,
      data,
    })
  }
}

async function importFromJSON(content: string) {
  const data = JSON.parse(content)
  const rows = Array.isArray(data) ? data : [data]

  for (const row of rows) {
    await dataApi.insertTableData({
      connectionId: props.connectionId,
      database: props.database,
      table: props.table,
      schema: props.schema,
      data: row,
    })
  }
}

async function importFromSQL(content: string) {
  // 直接执行SQL
  await queryApi.executeQuery(props.connectionId, content, props.database)
}

function handleCancel() {
  importFormat.value = 'csv'
  importMode.value = 'insert'
  filePath.value = ''
  delimiter.value = ','
  hasHeader.value = true
  visible.value = false
}
</script>
