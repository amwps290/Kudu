<template>
  <a-modal
    v-model:open="dialogVisible"
    :title="props.editingConnection ? $t('connection.edit') : $t('connection.new')"
    :width="600"
    @ok="handleSubmit"
    @cancel="handleCancel"
  >
    <a-form
      ref="formRef"
      :model="formData"
      :rules="rules"
      :label-col="{ span: 6 }"
      :wrapper-col="{ span: 18 }"
    >
      <a-form-item :label="$t('connection.form.name')" name="name">
        <a-input v-model:value="formData.name" :placeholder="$t('connection.form.placeholders.name')" />
      </a-form-item>

      <a-form-item :label="$t('connection.form.type')" name="db_type">
        <a-select v-model:value="formData.db_type" :placeholder="$t('connection.form.placeholders.type')">
          <a-select-option value="mysql">{{ getTypeOptionLabel('mysql', 'MySQL') }}</a-select-option>
          <a-select-option value="postgresql">{{ getTypeOptionLabel('postgresql', 'PostgreSQL') }}</a-select-option>
          <a-select-option value="sqlite">{{ getTypeOptionLabel('sqlite', 'SQLite') }}</a-select-option>
          <a-select-option value="mongodb">{{ getTypeOptionLabel('mongodb', 'MongoDB') }}</a-select-option>
          <a-select-option value="redis">{{ getTypeOptionLabel('redis', 'Redis') }}</a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item :label="$t('connection.form.color')">
        <div class="color-picker">
          <button
            v-for="color in connectionColors"
            :key="color"
            type="button"
            class="color-swatch"
            :class="{ active: formData.color === color }"
            :style="{ backgroundColor: color }"
            @click="formData.color = color"
          ></button>
          <a-button size="small" @click="formData.color = ''">{{ $t('common.clear') }}</a-button>
        </div>
        <div class="color-preview">
          <span class="preview-dot" :style="{ backgroundColor: formData.color || 'var(--border-color-strong)' }"></span>
          <span>{{ formData.color || $t('connection.form.color_none') }}</span>
        </div>
      </a-form-item>

      <!-- 非 SQLite 的常规参数 -->
      <template v-if="formData.db_type !== 'sqlite'">
        <a-form-item :label="$t('connection.form.host')" name="host">
          <a-input v-model:value="formData.host" :placeholder="$t('connection.form.placeholders.host')" />
        </a-form-item>

        <a-form-item :label="$t('connection.form.port')" name="port">
          <a-input-number
            v-model:value="formData.port"
            :min="1"
            :max="65535"
            class="full-width-input"
          />
        </a-form-item>

        <a-form-item :label="$t('connection.form.user')" name="username">
          <a-input 
            v-model:value="formData.username" 
            :placeholder="formData.db_type === 'redis' || formData.db_type === 'mongodb' ? $t('connection.form.placeholders.user_optional') : $t('connection.form.placeholders.user')" 
          />
        </a-form-item>

        <a-form-item :label="$t('connection.form.password')" name="password">
          <a-input-password 
            v-model:value="formData.password" 
            :placeholder="formData.db_type === 'redis' ? $t('connection.form.placeholders.password_optional') : $t('connection.form.placeholders.password')" 
          />
        </a-form-item>
      </template>

      <!-- SQLite 路径参数 -->
      <a-form-item v-if="formData.db_type === 'sqlite'" :label="$t('connection.form.sqlite_file')" name="host">
        <a-input-group compact>
          <a-input
            v-model:value="formData.host"
            :placeholder="$t('connection.form.placeholders.sqlite_file')"
            class="sqlite-path-input"
          />
          <a-button @click="handleSelectFile">{{ $t('connection.select_file') }}</a-button>
          <a-button @click="handleCreateFile" type="dashed">{{ $t('connection.create_file') }}</a-button>
        </a-input-group>
      </a-form-item>

      <a-form-item :label="$t('connection.form.database')" name="database" v-if="formData.db_type !== 'sqlite'">
        <a-input
          v-if="formData.db_type === 'redis'"
          v-model:value="formData.database"
          :placeholder="$t('connection.form.placeholders.database_redis')"
        />
        <a-input
          v-else
          v-model:value="formData.database"
          :placeholder="$t('connection.form.placeholders.database')"
        />
      </a-form-item>

      <a-form-item :label="$t('connection.form.ssl')" name="ssl" v-if="formData.db_type !== 'sqlite' && formData.db_type !== 'redis'">
        <a-switch v-model:checked="formData.ssl" />
      </a-form-item>

      <a-form-item :label="$t('connection.form.timeout')" name="connection_timeout">
        <a-input-number
          v-model:value="formData.connection_timeout"
          :min="1"
          :max="300"
          class="full-width-input"
        />
      </a-form-item>

      <a-form-item :label="$t('connection.form.protection')">
        <div class="protection-settings">
          <div class="protection-item">
            <div class="protection-copy">
              <div class="protection-title">{{ $t('connection.form.read_only') }}</div>
              <div class="protection-description">{{ $t('connection.form.read_only_help') }}</div>
            </div>
            <a-switch v-model:checked="formData.read_only" />
          </div>
        </div>
      </a-form-item>
    </a-form>

    <template #footer>
      <a-space>
        <a-button @click="handleCancel">{{ $t('common.cancel') }}</a-button>
        <a-button v-if="formData.db_type !== 'sqlite'" :loading="testing" @click="handleTest">{{ $t('connection.test') }}</a-button>
        <a-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ props.editingConnection ? $t('common.update') : $t('common.save') }}
        </a-button>
      </a-space>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { reactive, watch, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { message, Modal } from '@/ui/antd'
import { getErrorMessage } from '@/utils/errorHandler'
import { useConnectionStore } from '@/stores/connection'
import type { ConnectionConfig, DatabaseType } from '@/types/database'
import { open, save } from '@tauri-apps/plugin-dialog'
import { connectionApi } from '@/api'
import { getDatabaseSupportProfile } from '@/utils/databaseSupport'

const { t } = useI18n()
const props = defineProps<{
  visible: boolean
  editingConnection?: import('@/types/database').ConnectionConfig | null
}>()

const emit = defineEmits(['update:visible', 'close'])

const connectionStore = useConnectionStore()
const formRef = ref()
const testing = ref(false)
const submitting = ref(false)
const connectionColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
})

// 表单数据
const formData = reactive<{
  name: string
  db_type: DatabaseType
  host: string
  port: number
  username: string
  password: string
  database: string
  ssl: boolean
  connection_timeout: number
  pool_size: number
  read_only: boolean
  color: string
}>({
  name: '',
  db_type: 'mysql',
  host: 'localhost',
  port: 3306,
  username: 'root',
  password: '',
  database: '',
  ssl: false,
  connection_timeout: 10,
  pool_size: 10,
  read_only: false,
  color: '',
})

function getTypeOptionLabel(dbType: DatabaseType, displayName: string) {
  const profile = getDatabaseSupportProfile(dbType)
  return `${displayName} · ${t(`connection.support.levels.${profile.level}`)}`
}

// 表单验证规则
const rules = computed(() => {
  const baseRules: Record<string, { required?: boolean; message: string }[]> = {
    name: [{ required: true, message: t('connection.form.placeholders.name') }],
    db_type: [{ required: true, message: t('connection.form.placeholders.type') }],
    host: [{ required: true, message: formData.db_type === 'sqlite' ? t('connection.form.placeholders.sqlite_file') : t('connection.form.host') }],
  }
  
  if (formData.db_type !== 'sqlite') {
    baseRules.port = [{ required: true, message: t('connection.form.port') }]
  }
  
  if (formData.db_type !== 'redis' && formData.db_type !== 'mongodb' && formData.db_type !== 'sqlite') {
    baseRules.username = [{ required: true, message: t('connection.form.user') }]
  }
  
  return baseRules
})

// 监听编辑连接变化
watch(
  () => props.editingConnection,
  (connection) => {
    if (connection) {
      Object.assign(formData, {
        name: connection.name || '',
        db_type: connection.db_type || 'mysql',
        host: connection.host || (connection.db_type === 'sqlite' ? '' : 'localhost'),
        port: connection.port || 3306,
        username: connection.username || (connection.db_type === 'sqlite' ? '' : 'root'),
        password: '', 
        database: connection.database || '',
        ssl: connection.ssl || false,
        connection_timeout: connection.connection_timeout || 10,
        pool_size: connection.pool_size || 10,
        read_only: connection.read_only ?? false,
        color: connection.color || '',
      })
    } else {
      resetForm()
    }
  },
  { immediate: true }
)

// 监听对话框打开/关闭
watch(() => props.visible, (visible) => {
  if (visible && !props.editingConnection) resetForm()
})

// 监听数据库类型变化
watch(() => formData.db_type, (type) => {
  if (!props.editingConnection) {
    const portMap: Record<string, number> = {
      mysql: 3306,
      postgresql: 5432,
      mongodb: 27017,
      redis: 6379,
      sqlite: 0,
    }
    formData.port = portMap[type] || 3306
    if (type === 'sqlite') {
      formData.host = ''
      formData.username = ''
    }
  }
})

// 测试连接
async function handleTest() {
  try {
    await formRef.value.validate()
    testing.value = true
    const result = await connectionStore.testConnection({ ...formData, id: '' } as ConnectionConfig)
    if (result) {
      message.success(t('connection.test_success_ping', { ms: result.ping_time_ms }))
    }
  } catch (error: unknown) {
    Modal.error({ title: t('connection.test_fail'), content: getErrorMessage(error) || t('connection.fail'), width: 500 })
  } finally {
    testing.value = false
  }
}

// 提交保存
async function handleSubmit() {
  try {
    await formRef.value.validate()
    submitting.value = true
    
    const isNew = !props.editingConnection
    const config: ConnectionConfig = {
      ...formData,
      color: formData.color || undefined,
      id: isNew ? window.crypto.randomUUID() : props.editingConnection.id,
      tags: isNew ? [] : props.editingConnection.tags || [],
      created_at: isNew ? Date.now() : props.editingConnection.created_at,
      updated_at: Date.now(),
    }
    
    if (isNew) {
      await connectionStore.saveConnection(config, formData.password)
    } else {
      await connectionStore.updateConnection(config, formData.password)
    }
    
    message.success(isNew ? t('connection.save_success') : t('connection.update_success'))
    dialogVisible.value = false
    resetForm()
  } catch (error: unknown) {
    // 处理 Ant Design Vue 表单验证失败的情况
    const err = error as { errorFields?: unknown }; if (err.errorFields) return;
    message.error(getErrorMessage(error) || t('common.fail'))
  } finally {
    submitting.value = false
  }
}

// 取消
function handleCancel() {
  dialogVisible.value = false
  resetForm()
  emit('close')
}

// 选择 SQLite 文件
async function handleSelectFile() {
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] }]
    })
    if (selected) formData.host = selected as string
  } catch (error: unknown) {
    message.error(`${t('common.fail')}: ${getErrorMessage(error)}`)
  }
}

// 新建 SQLite 文件
async function handleCreateFile() {
  try {
    const path = await save({
      filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }]
    })
    if (path) {
      await connectionApi.createSqliteDatabase(path)
      formData.host = path
      // 自动设置连接名称
      const fileName = path.split(/[\\/]/).pop()?.split('.')[0] || 'New SQLite'
      if (!formData.name) formData.name = fileName
      message.success(t('connection.sqlite_created'))
    }
  } catch (error: unknown) {
    message.error(`${t('common.fail')}: ${getErrorMessage(error)}`)
  }
}

// 重置表单
function resetForm() {
  // 这种写法更安全，防止 formRef 还没挂载
  Object.assign(formData, {
    name: '',
    db_type: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: '',
    database: '',
    ssl: false,
    connection_timeout: 10,
    pool_size: 10,
    read_only: false,
    color: '',
  })
}
</script>

<style scoped>
:deep(.ant-form-item) {
  margin-bottom: 16px;
}

.color-picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.color-swatch {
  width: 22px;
  height: 22px;
  border: 2px solid transparent;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.12);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.color-swatch:hover {
  transform: scale(1.06);
}

.color-swatch.active {
  border-color: var(--app-text);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
}

.full-width-input {
  width: 100%;
}

.sqlite-path-input {
  width: calc(100% - 160px);
}

.color-preview {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: var(--app-text-subtle);
  font-size: 12px;
}

.preview-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.protection-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.protection-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.protection-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.protection-title {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
}

.protection-description {
  color: var(--app-text-subtle);
  font-size: 12px;
  line-height: 1.5;
}
</style>
