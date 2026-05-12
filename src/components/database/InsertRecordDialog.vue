<template>
  <a-modal
    v-model:open="visible"
    :title="$t('dialog.insert_record.title', { table })"
    width="700px"
    @ok="handleInsert"
    @cancel="handleCancel"
    :confirm-loading="inserting"
  >
    <a-spin :spinning="loadingColumns">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 18 }">
        <a-form-item
          v-for="col in columns"
          :key="col.name"
          :label="col.name"
          :required="!col.nullable && !col.is_auto_increment"
        >
          <div class="insert-field">
            <a-select
              v-if="getFieldKind(col) === 'boolean'"
              v-model:value="formData[col.name]"
              :options="getBooleanOptions(col)"
              :placeholder="getPlaceholder(col)"
              :disabled="isFieldDisabled(col)"
              @change="markFieldDirty(col.name)"
            />
            <a-textarea
              v-else-if="getFieldKind(col) === 'textarea' || getFieldKind(col) === 'json'"
              v-model:value="formData[col.name]"
              :placeholder="getPlaceholder(col)"
              :disabled="isFieldDisabled(col)"
              :rows="getFieldKind(col) === 'json' ? 5 : 3"
              @change="markFieldDirty(col.name)"
            />
            <a-input
              v-else
              v-model:value="formData[col.name]"
              :placeholder="getPlaceholder(col)"
              :disabled="isFieldDisabled(col)"
              @change="markFieldDirty(col.name)"
            />
          </div>
          <div class="insert-field-meta">
            <span>{{ col.data_type }}</span>
            <span v-if="hasColumnDefault(col)">{{ $t('dialog.insert_record.default_value', { value: col.default_value }) }}</span>
            <span v-else-if="col.is_auto_increment">{{ $t('dialog.insert_record.auto_generated') }}</span>
            <span v-else-if="col.nullable">{{ $t('dialog.insert_record.optional') }}</span>
            <span v-else>{{ $t('dialog.insert_record.required') }}</span>
          </div>
          <div class="insert-field-options">
            <a-checkbox
              v-if="col.nullable && !col.is_auto_increment && getFieldKind(col) !== 'boolean'"
              v-model:checked="nullFields[col.name]"
              @change="handleNullToggle(col)"
            >
              {{ $t('data.set_null') }}
            </a-checkbox>
          </div>
          <div v-if="col.comment" class="insert-field-comment">
            {{ col.comment }}
          </div>
        </a-form-item>
      </a-form>
    </a-spin>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { message } from '@/ui/antd'
import { useI18n } from 'vue-i18n'
import { metadataApi, dataApi } from '@/api'
import { useDialogModel } from '@/composables/useDialogModel'
import {
  getInsertFieldKind,
  hasColumnDefault,
  normalizeInsertValue,
  parseColumnDefaultValue,
} from '@/utils/tableColumns'
import type { ColumnInfo } from '@/types/database'

type InsertColumn = ColumnInfo

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  connectionId: string
  database: string
  table: string
  schema?: string
}>()

const emit = defineEmits(['update:modelValue', 'inserted'])

const visible = useDialogModel(props, emit)

const inserting = ref(false)
const loadingColumns = ref(false)
const columns = ref<InsertColumn[]>([])
const formData = ref<Record<string, any>>({})
const dirtyFields = ref<Record<string, boolean>>({})
const nullFields = ref<Record<string, boolean>>({})

function getFieldKind(col: InsertColumn) {
  return getInsertFieldKind(col)
}

function getInitialValue(col: InsertColumn) {
  const parsed = parseColumnDefaultValue(col.default_value)
  if (parsed === undefined) return undefined

  const normalized = normalizeInsertValue(col, parsed)
  if (getFieldKind(col) === 'boolean') {
    return normalized === null ? null : normalized ? 1 : 0
  }
  return normalized
}

function getPlaceholder(col: InsertColumn): string {
  if (col.is_auto_increment) {
    return t('dialog.insert_record.auto_generated')
  }
  if (col.default_value) {
    return t('dialog.insert_record.default_value', { value: col.default_value })
  }
  if (col.nullable) {
    return t('dialog.insert_record.optional')
  }
  return t('dialog.insert_record.required')
}

function getBooleanOptions(col: InsertColumn) {
  const options: Array<{ label: string, value: string | number | null }> = [
    { label: t('dialog.insert_record.boolean_true'), value: 1 },
    { label: t('dialog.insert_record.boolean_false'), value: 0 },
  ]

  if (col.nullable) {
    options.push({ label: t('data.set_null'), value: null })
  }

  return options
}

function isFieldDisabled(col: InsertColumn) {
  return col.is_auto_increment || Boolean(nullFields.value[col.name])
}

function markFieldDirty(field: string) {
  dirtyFields.value[field] = true
}

function handleNullToggle(col: InsertColumn) {
  const enabled = Boolean(nullFields.value[col.name])
  if (enabled) {
    formData.value[col.name] = null
    dirtyFields.value[col.name] = true
    return
  }

  formData.value[col.name] = getInitialValue(col)
  dirtyFields.value[col.name] = false
}

function resetFormState() {
  const nextFormData: Record<string, any> = {}
  const nextDirtyFields: Record<string, boolean> = {}
  const nextNullFields: Record<string, boolean> = {}

  for (const col of columns.value) {
    nextFormData[col.name] = getInitialValue(col)
    nextDirtyFields[col.name] = false
    nextNullFields[col.name] = false
  }

  formData.value = nextFormData
  dirtyFields.value = nextDirtyFields
  nullFields.value = nextNullFields
}

async function loadTableStructure() {
  if (!props.table) return

  loadingColumns.value = true
  try {
    const result = await metadataApi.getTableStructure({
      connectionId: props.connectionId,
      table: props.table,
      schema: props.schema || null,
      database: props.database,
    }) as unknown as InsertColumn[]

    columns.value = result
    resetFormState()
  } catch (error: unknown) {
    message.error(t('dialog.insert_record.load_fail', { error: String(error) }))
  } finally {
    loadingColumns.value = false
  }
}

function buildInsertPayload() {
  const data: Record<string, any> = {}
  const missingFields: string[] = []

  for (const col of columns.value) {
    if (col.is_auto_increment) continue

    const initialValue = getInitialValue(col)
    const touched = Boolean(dirtyFields.value[col.name])
    const hasDefaultValue = hasColumnDefault(col)

    if (nullFields.value[col.name]) {
      data[col.name] = null
      continue
    }

    const rawValue = formData.value[col.name]
    if (rawValue === undefined || rawValue === null) {
      if (rawValue === null && touched && col.nullable) {
        data[col.name] = null
      } else if (!col.nullable && !hasDefaultValue) {
        missingFields.push(col.name)
      }
      continue
    }

    if (!touched && hasDefaultValue && JSON.stringify(rawValue) === JSON.stringify(initialValue)) {
      continue
    }

    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim()
      if (!trimmed) {
        if (getFieldKind(col) === 'text' || getFieldKind(col) === 'textarea') {
          if (touched) {
            data[col.name] = rawValue
          } else if (!col.nullable && !hasDefaultValue) {
            missingFields.push(col.name)
          }
          continue
        }

        if (!col.nullable && !hasDefaultValue) missingFields.push(col.name)
        continue
      }
    }

    data[col.name] = normalizeInsertValue(col, rawValue)
  }

  return { data, missingFields }
}

async function handleInsert() {
  let payload: Record<string, any> = {}
  try {
    const { data, missingFields } = buildInsertPayload()
    if (missingFields.length > 0) {
      message.error(t('dialog.insert_record.field_required', { field: missingFields.join(', ') }))
      return
    }
    if (Object.keys(data).length === 0) {
      message.error(t('data.insert_empty_error'))
      return
    }
    payload = data
  } catch (error: unknown) {
    const detail = String(error)
    if (detail.startsWith('Error: INVALID_JSON:')) {
      const field = detail.slice('Error: INVALID_JSON:'.length)
      message.error(t('dialog.insert_record.invalid_json', { field }))
      return
    }
    message.error(t('dialog.insert_record.fail', { error: detail }))
    return
  }

  inserting.value = true
  try {
    await dataApi.insertTableData({
      connectionId: props.connectionId,
      database: props.database,
      table: props.table,
      schema: props.schema,
      data: payload,
    })

    message.success(t('dialog.insert_record.success'))
    emit('inserted', payload)
    handleCancel()
  } catch (error: unknown) {
    message.error(t('dialog.insert_record.fail', { error: String(error) }))
  } finally {
    inserting.value = false
  }
}

function handleCancel() {
  resetFormState()
  visible.value = false
}

watch(visible, (newVal) => {
  if (newVal) {
    loadTableStructure()
  }
})
</script>

<style scoped>
:deep(.ant-form-item) {
  margin-bottom: 16px;
}

.insert-field {
  width: 100%;
}

.insert-field-meta,
.insert-field-comment {
  margin-top: 4px;
  font-size: 12px;
  color: #8c8c8c;
}

.insert-field-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.insert-field-options {
  min-height: 22px;
  margin-top: 4px;
}
</style>
