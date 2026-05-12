<template>
  <a-modal
    :open="visible"
    :title="$t('dialog.create_database.title')"
    @ok="handleCreate"
    @cancel="handleCancel"
    :confirm-loading="loading"
  >
    <a-form
      ref="formRef"
      :model="formState"
      :label-col="{ span: 6 }"
      :wrapper-col="{ span: 18 }"
    >
      <a-form-item
        :label="$t('dialog.create_database.name')"
        name="databaseName"
        :rules="[
          { required: true, message: $t('dialog.create_database.name_required') },
          { pattern: /^[a-zA-Z0-9_]+$/, message: $t('dialog.create_database.name_pattern') }
        ]"
      >
        <a-input
          v-model:value="formState.databaseName"
          :placeholder="$t('dialog.create_database.name_placeholder')"
          @pressEnter="handleCreate"
        />
      </a-form-item>

      <a-form-item
        v-if="isMysql"
        :label="$t('dialog.create_database.charset')"
        name="charset"
      >
        <a-select v-model:value="formState.charset">
          <a-select-option value="utf8mb4">utf8mb4 ({{ $t('dialog.create_database.charset_recommend') }})</a-select-option>
          <a-select-option value="utf8">utf8</a-select-option>
          <a-select-option value="latin1">latin1</a-select-option>
          <a-select-option value="gbk">gbk</a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item
        v-if="isMysql"
        :label="$t('dialog.create_database.collation')"
        name="collation"
      >
        <a-select v-model:value="formState.collation">
          <a-select-option value="utf8mb4_general_ci">utf8mb4_general_ci</a-select-option>
          <a-select-option value="utf8mb4_unicode_ci">utf8mb4_unicode_ci</a-select-option>
          <a-select-option value="utf8mb4_bin">utf8mb4_bin</a-select-option>
          <a-select-option value="utf8_general_ci">utf8_general_ci</a-select-option>
          <a-select-option value="utf8_unicode_ci">utf8_unicode_ci</a-select-option>
        </a-select>
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { reactive, ref, watch, computed } from 'vue'
import { message } from '@/ui/antd'
import { useI18n } from 'vue-i18n'
import { queryApi } from '@/api'
import type { FormInstance } from '@/ui/antd'

const { t } = useI18n()

const props = defineProps<{
  visible: boolean
  connectionId: string
  dbType?: string
}>()

const emit = defineEmits(['update:visible', 'created'])

const formRef = ref<FormInstance>()
const loading = ref(false)

// 判断是否为 MySQL
const isMysql = computed(() => {
  return props.dbType?.toLowerCase() === 'mysql'
})

const formState = reactive({
  databaseName: '',
  charset: 'utf8mb4',
  collation: 'utf8mb4_general_ci',
})

// 重置表单
function resetForm() {
  formState.databaseName = ''
  formState.charset = 'utf8mb4'
  formState.collation = 'utf8mb4_general_ci'
  formRef.value?.resetFields()
}

// 创建数据库
async function handleCreate() {
  try {
    await formRef.value?.validate()

    loading.value = true

    // SQLite 不支持 CREATE DATABASE 语句
    const dbType = props.dbType?.toLowerCase()
    if (dbType === 'sqlite') {
      message.error(t('dialog.create_database.sqlite_not_supported'))
      return
    }

    // 根据数据库类型构建 CREATE DATABASE 语句
    let sql = ''
    if (dbType === 'mysql') {
      // MySQL 语法
      sql = `CREATE DATABASE \`${formState.databaseName}\`
        CHARACTER SET ${formState.charset}
        COLLATE ${formState.collation}`
    } else if (dbType === 'postgresql') {
      // PostgreSQL 语法（不支持 CHARSET 和 COLLATE 在 CREATE DATABASE 语句中）
      sql = `CREATE DATABASE "${formState.databaseName}"`
    } else {
      // 默认使用 MySQL 语法
      sql = `CREATE DATABASE \`${formState.databaseName}\`
        CHARACTER SET ${formState.charset}
        COLLATE ${formState.collation}`
    }

    await queryApi.executeQuery(props.connectionId, sql)

    message.success(t('dialog.create_database.success', { name: formState.databaseName }))

    emit('created', formState.databaseName)
    emit('update:visible', false)

    resetForm()
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'errorFields' in error) {
      // 表单验证错误
      return
    }
    message.error(t('dialog.create_database.fail', { error: String(error) }))
  } finally {
    loading.value = false
  }
}

// 取消
function handleCancel() {
  emit('update:visible', false)
  resetForm()
}

// 监听对话框关闭
watch(() => props.visible, (visible) => {
  if (!visible) {
    resetForm()
  }
})
</script>

<style scoped>
/* 样式可以根据需要添加 */
</style>
