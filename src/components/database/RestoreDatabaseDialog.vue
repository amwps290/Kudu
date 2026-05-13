<template>
  <a-modal
    v-model:open="visible"
    :title="$t('dialog.restore_database.title', { database })"
    width="600px"
    @ok="handleRestore"
    @cancel="handleCancel"
    :confirm-loading="restoring"
  >
    <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 18 }">
      <a-form-item :label="$t('dialog.restore_database.backup_file')" required>
        <a-input
          v-model:value="filePath"
          :placeholder="$t('dialog.restore_database.backup_file_placeholder')"
          readonly
          @click="selectFile"
        >
          <template #suffix>
            <FileOutlined class="file-input-icon" @click="selectFile" />
          </template>
        </a-input>
      </a-form-item>

      <a-form-item :label="$t('dialog.restore_database.restore_mode')">
        <a-radio-group v-model:value="restoreMode">
          <a-radio value="append">{{ $t('dialog.restore_database.mode_append') }}</a-radio>
          <a-radio value="replace">{{ $t('dialog.restore_database.mode_replace') }}</a-radio>
        </a-radio-group>
      </a-form-item>

      <a-form-item :label="$t('dialog.restore_database.skip_errors')">
        <a-switch v-model:checked="skipErrors" />
        <span class="text-caption skip-errors-tip">
          {{ $t('dialog.restore_database.skip_errors_tip') }}
        </span>
      </a-form-item>
    </a-form>

    <a-alert
      v-if="restoreMode === 'replace'"
      :message="$t('common.warning')"
      :description="$t('dialog.restore_database.replace_warning')"
      type="warning"
      show-icon
      class="preview-hint replace-warning"
    />
  </a-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { FileOutlined } from '@ant-design/icons-vue'
import { message, Modal } from '@/ui/antd'
import { useI18n } from 'vue-i18n'
import { queryApi, utilsApi } from '@/api'
import { open } from '@tauri-apps/plugin-dialog'
import { useDialogModel } from '@/composables/useDialogModel'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  connectionId: string
  database: string
}>()

const emit = defineEmits(['update:modelValue', 'restored'])

const visible = useDialogModel(props, emit)

const restoring = ref(false)
const filePath = ref('')
const restoreMode = ref('append')
const skipErrors = ref(false)

async function selectFile() {
  const path = await open({
    filters: [{
      name: t('dialog.restore_database.sql_file'),
      extensions: ['sql'],
    }],
    multiple: false,
  })

  if (path) {
    filePath.value = path as string
  }
}

async function handleRestore() {
  if (!filePath.value) {
    message.error(t('dialog.restore_database.file_required'))
    return
  }

  if (restoreMode.value === 'replace') {
    Modal.confirm({
      title: t('dialog.restore_database.confirm_title'),
      content: t('dialog.restore_database.confirm_content'),
      okText: t('common.ok'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        await doRestore()
      },
    })
  } else {
    await doRestore()
  }
}

async function doRestore() {
  restoring.value = true
  try {
    // 读取SQL文件
    const sqlContent = await utilsApi.readFile(filePath.value)

    // 分割SQL语句（按分号分割，但要注意字符串和注释中的分号）
    const statements = splitSqlStatements(sqlContent)

    let successCount = 0
    let errorCount = 0

    for (const statement of statements) {
      const sql = statement.trim()
      if (!sql || sql.startsWith('--')) continue

      try {
        await queryApi.executeQuery(props.connectionId, sql, props.database)
        successCount++
      } catch (error: unknown) {
        errorCount++
        if (!skipErrors.value) {
          throw new Error(t('dialog.restore_database.sql_error', { error: String(error) }))
        }
        console.error('SQL error (skipped):', error)
      }
    }

    message.success(t('dialog.restore_database.success', { success: successCount, fail: errorCount }))
    emit('restored')
    handleCancel()
  } catch (error: unknown) {
    message.error(t('dialog.restore_database.fail', { error: String(error) }))
  } finally {
    restoring.value = false
  }
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let inString = false
  let stringChar = ''
  let inComment = false

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]
    const nextChar = sql[i + 1]

    // 处理注释
    if (!inString && char === '-' && nextChar === '-') {
      inComment = true
      current += char
      continue
    }

    if (inComment && char === '\n') {
      inComment = false
      current += char
      continue
    }

    if (inComment) {
      current += char
      continue
    }

    // 处理字符串
    if (!inString && (char === '"' || char === "'")) {
      inString = true
      stringChar = char
      current += char
      continue
    }

    if (inString && char === stringChar && sql[i - 1] !== '\\') {
      inString = false
      current += char
      continue
    }

    // 处理分号
    if (!inString && char === ';') {
      current += char
      statements.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) {
    statements.push(current.trim())
  }

  return statements
}

function handleCancel() {
  filePath.value = ''
  restoreMode.value = 'append'
  skipErrors.value = false
  visible.value = false
}
</script>

<style scoped>
.file-input-icon {
  cursor: pointer;
}

.skip-errors-tip {
  margin-left: 8px;
}
</style>
