<template>
  <a-modal
    v-model:open="visible"
    :title="$t('dialog.create_view.title')"
    width="800px"
    @ok="handleCreate"
    @cancel="handleCancel"
    :confirm-loading="creating"
  >
    <a-form :label-col="{ span: 4 }" :wrapper-col="{ span: 20 }">
      <a-form-item :label="$t('dialog.create_view.view_name')" required>
        <a-input v-model:value="viewName" :placeholder="$t('dialog.create_view.view_name_placeholder')" />
      </a-form-item>

      <a-form-item :label="$t('dialog.create_view.sql_query')" required>
        <div ref="editorContainer" class="view-editor-container"></div>
      </a-form-item>

      <a-form-item :label="$t('dialog.create_view.view_comment')">
        <a-input v-model:value="comment" :placeholder="$t('dialog.create_view.view_comment_placeholder')" />
      </a-form-item>
    </a-form>

    <a-alert
      :message="$t('common.tip')"
      :description="$t('dialog.create_view.tip_message')"
      type="info"
      show-icon
      class="view-tip-alert"
    />
  </a-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { message } from '@/ui/antd'
import { useI18n } from 'vue-i18n'
import { queryApi } from '@/api'
import { useMonacoEditor } from '@/composables/useMonacoEditor'
import { useDialogModel } from '@/composables/useDialogModel'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  connectionId: string
  database: string
}>()

const emit = defineEmits(['update:modelValue', 'created'])

const visible = useDialogModel(props, emit)

const creating = ref(false)
const viewName = ref('')
const comment = ref('')
const editorContainer = ref<HTMLElement>()
const { editor, getValue, setValue: setEditorValue, createEditor } = useMonacoEditor(editorContainer, {
  value: 'SELECT * FROM table_name',
  language: 'sql',
})

// 当对话框可见时初始化编辑器
import { watch } from 'vue'
watch(visible, (val) => {
  if (val) createEditor()
})

function generateCreateViewSql(): string {
  if (!viewName.value || !editor.value) {
    return ''
  }

  const selectSql = getValue().trim()
  let sql = `CREATE VIEW \`${viewName.value}\` AS ${selectSql}`

  return sql
}

async function handleCreate() {
  if (!viewName.value.trim()) {
    message.error(t('dialog.create_view.view_name_required'))
    return
  }

  const selectSql = getValue().trim()
  if (!selectSql) {
    message.error(t('dialog.create_view.sql_required'))
    return
  }

  creating.value = true
  try {
    const sql = generateCreateViewSql()

    await queryApi.executeQuery(props.connectionId, sql, props.database)

    message.success(t('dialog.create_view.success'))
    emit('created')
    handleCancel()
  } catch (error: unknown) {
    message.error(t('dialog.create_view.fail', { error: String(error) }))
  } finally {
    creating.value = false
  }
}

function handleCancel() {
  viewName.value = ''
  comment.value = ''
  setEditorValue('SELECT * FROM table_name')
  visible.value = false
}
</script>

<style scoped>
.view-editor-container {
  height: 300px;
  border: 1px solid var(--border-color-strong);
  border-radius: var(--radius-sm);
}

.view-tip-alert {
  margin-top: 12px;
}
</style>

<style scoped>
:deep(.ant-form-item-control-input-content) {
  line-height: 1;
}
</style>
