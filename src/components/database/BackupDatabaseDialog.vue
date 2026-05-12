<template>
  <a-modal
    v-model:open="visible"
    :title="$t('dialog.backup_database.title', { database })"
    width="600px"
    @ok="handleBackup"
    @cancel="handleCancel"
    :confirm-loading="backing"
  >
    <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 18 }">
      <a-form-item :label="$t('dialog.backup_database.content')">
        <a-checkbox-group v-model:value="backupOptions">
          <a-checkbox
            v-for="option in availableBackupOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </a-checkbox>
        </a-checkbox-group>
      </a-form-item>

      <a-form-item :label="$t('dialog.backup_database.save_path')" required>
        <a-input
          v-model:value="savePath"
          :placeholder="$t('dialog.backup_database.save_path_placeholder')"
          readonly
          @click="selectSavePath"
        >
          <template #suffix>
            <FolderOpenOutlined style="cursor: pointer" @click="selectSavePath" />
          </template>
        </a-input>
      </a-form-item>

    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FolderOpenOutlined } from '@ant-design/icons-vue'
import { message, Modal } from '@/ui/antd'
import { useI18n } from 'vue-i18n'
import { metadataApi, queryApi, exportApi, utilsApi } from '@/api'
import { save } from '@tauri-apps/plugin-dialog'
import { downloadDir } from '@tauri-apps/api/path'
import { useDialogModel } from '@/composables/useDialogModel'
import { useConnectionStore } from '@/stores/connection'
import type { DatabaseType } from '@/types/database'

const { t } = useI18n()
const connectionStore = useConnectionStore()

const props = defineProps<{
  modelValue: boolean
  connectionId: string
  database: string
}>()

const emit = defineEmits(['update:modelValue', 'backed'])

const visible = useDialogModel(props, emit)

const backing = ref(false)
type BackupOptionValue = 'structure' | 'data' | 'views'

const availableBackupOptions = computed<Array<{ value: BackupOptionValue, label: string }>>(() => [
  { value: 'structure', label: t('dialog.backup_database.structure') },
  { value: 'data', label: t('dialog.backup_database.table_data') },
  { value: 'views', label: t('dialog.backup_database.views') },
])
const defaultBackupOptions: BackupOptionValue[] = ['structure', 'data']
const backupOptions = ref<BackupOptionValue[]>([...defaultBackupOptions])
const savePath = ref('')
const currentDbType = computed<DatabaseType>(() => {
  return connectionStore.connections.find(connection => connection.id === props.connectionId)?.db_type || 'mysql'
})

function quoteIdentifier(name: string) {
  if (currentDbType.value === 'mysql') {
    return `\`${name.replace(/`/g, '``')}\``
  }
  return `"${name.replace(/"/g, '""')}"`
}

function qualifyObjectName(name: string, schema?: string) {
  if (currentDbType.value === 'postgresql' && schema) {
    return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`
  }
  return quoteIdentifier(name)
}

function stringifySqlValue(value: unknown) {
  if (value === null || value === undefined) {
    return 'NULL'
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value)
  }
  if (typeof value === 'boolean') {
    return currentDbType.value === 'mysql'
      ? (value ? '1' : '0')
      : (value ? 'TRUE' : 'FALSE')
  }
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`
  }
  return `'${JSON.stringify(value).replace(/'/g, "''")}'`
}

function getSelectedBackupSummary() {
  return availableBackupOptions.value
    .filter(option => backupOptions.value.includes(option.value))
    .map(option => option.label)
    .join('、')
}

// 生成默认文件名
function getDefaultFileName(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  return `${props.database}_backup_${timestamp}.sql`
}

// 当对话框打开时，设置默认保存路径（Downloads目录）
watch(() => props.modelValue, async (newVal) => {
  if (newVal && !savePath.value) {
    try {
      const downloadsPath = await downloadDir()
      const fileName = getDefaultFileName()
      savePath.value = `${downloadsPath}\\${fileName}`
    } catch (error) {
      console.error('Failed to get download dir:', error)
      savePath.value = getDefaultFileName()
    }
  }
})

async function selectSavePath() {
  const defaultPath = getDefaultFileName()

  const path = await save({
    defaultPath,
    filters: [{
      name: t('dialog.backup_database.sql_file'),
      extensions: ['sql'],
    }],
  })

  if (path) {
    savePath.value = path
  }
}

async function handleBackup() {
  if (!savePath.value) {
    message.error(t('dialog.backup_database.save_path_required'))
    return
  }

  if (backupOptions.value.length === 0) {
    message.error(t('dialog.backup_database.content_required'))
    return
  }

  backing.value = true
  try {
    let backupSql = `-- ${t('dialog.backup_database.comment_backup')}: ${props.database}\n`
    backupSql += `-- ${t('dialog.backup_database.comment_time')}: ${new Date().toLocaleString()}\n\n`

    // 备份表结构和数据
    if (backupOptions.value.includes('structure') || backupOptions.value.includes('data')) {
      const tables = await metadataApi.getTables(props.connectionId, props.database)

      for (const table of tables) {
        // 导出表结构
        if (backupOptions.value.includes('structure')) {
          const ddl = await exportApi.tableDdl(
            props.connectionId,
            props.database,
            table.name,
            table.schema,
          )
          backupSql += `\n-- ${t('dialog.backup_database.comment_structure')}: ${table.name}\n`
          backupSql += `DROP TABLE IF EXISTS ${qualifyObjectName(table.name, table.schema)};\n`
          backupSql += `${ddl};\n\n`
        }

        // 导出表数据
        if (backupOptions.value.includes('data')) {
          const qualifiedTableName = qualifyObjectName(table.name, table.schema)
          const result = await queryApi.executeQuery(
            props.connectionId,
            `SELECT * FROM ${qualifiedTableName}`,
            props.database,
          )

          const resultData = result[0]
          if (resultData && resultData.rows && resultData.rows.length > 0) {
            backupSql += `-- ${t('dialog.backup_database.comment_data')}: ${table.name}\n`

            for (const row of resultData.rows) {
              const columns = Object.keys(row)
              const values = columns.map(col => stringifySqlValue(row[col]))
              const quotedColumns = columns.map(col => quoteIdentifier(col)).join(', ')

              backupSql += `INSERT INTO ${qualifiedTableName} (${quotedColumns}) VALUES (${values.join(', ')});\n`
            }
            backupSql += '\n'
          }
        }
      }
    }

    // 备份视图
    if (backupOptions.value.includes('views')) {
      const views = await metadataApi.getViews(props.connectionId, props.database)

      for (const view of views) {
        const definition = await metadataApi.getViewDefinition({
          connectionId: props.connectionId,
          database: props.database,
          view: view.name,
          schema: view.schema,
        })
        backupSql += `\n-- ${t('dialog.backup_database.comment_view')}: ${view.name}\n`
        backupSql += `DROP VIEW IF EXISTS ${qualifyObjectName(view.name, view.schema)};\n`
        backupSql += `${definition};\n\n`
      }
    }

    // 保存到文件
    await utilsApi.writeFile(savePath.value, backupSql)

    // 显示备份成功提示
    Modal.success({
      title: t('dialog.backup_database.success_title'),
      content: t('dialog.backup_database.success_content', {
        database: props.database,
        path: savePath.value,
        summary: getSelectedBackupSummary(),
      }),
      okText: t('common.ok'),
    })

    emit('backed')
    handleCancel()
  } catch (error: unknown) {
    message.error(t('dialog.backup_database.fail', { error: String(error) }))
  } finally {
    backing.value = false
  }
}

function handleCancel() {
  backupOptions.value = [...defaultBackupOptions]
  savePath.value = ''
  visible.value = false
}
</script>
