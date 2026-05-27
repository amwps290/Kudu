<template>
  <div class="panel-shell">
    <template v-if="context">
      <div class="panel-header">
        <div class="panel-title">{{ context.objectName || '-' }}</div>
        <div class="panel-subtitle">
          <span>{{ objectTypeLabel }}</span>
          <span class="panel-subtitle__divider">·</span>
          <span>{{ context.connectionName || context.connectionId || '-' }}</span>
          <span class="panel-subtitle__divider">·</span>
          <span>{{ context.database || '-' }}</span>
        </div>
      </div>

      <div class="property-table-wrap">
        <div class="property-table">
          <div class="property-row property-row--head">
            <div>{{ $t('common.title') }}</div>
            <div>{{ $t('common.description') }}</div>
          </div>
          <div v-for="item in allRows" :key="`${item.label}-${item.value}`" class="property-row">
            <div class="property-key">{{ item.label }}</div>
            <div class="property-value">{{ item.value }}</div>
          </div>
        </div>
      </div>
    </template>
    <a-empty v-else :description="$t('right_panel.empty')" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RightPanelContext } from '@/types/rightPanel'

const props = defineProps<{
  context: RightPanelContext | null
}>()

const { t } = useI18n()

const metadata = computed(() => props.context?.metadata || {})

const objectTypeLabel = computed(() => {
  const type = props.context?.objectType || 'unknown'
  const map: Record<string, string> = {
    database: t('common.database'),
    schema: t('tree.schemas'),
    table: t('tree.tables'),
    view: t('tree.views'),
    'materialized-view': t('tree.materialized_views'),
    column: t('tree.columns'),
    index: t('tree.indexes'),
    'foreign-key': t('tree.foreign_keys'),
    'unique-constraint': t('tree.uniques'),
    'check-constraint': t('tree.checks'),
    'exclude-constraint': t('tree.excludes'),
    trigger: t('tree.triggers'),
    rule: t('tree.rules'),
    function: t('tree.functions'),
    procedure: t('tree.procedures'),
    aggregate: t('tree.aggregates'),
    sequence: t('tree.sequences'),
    'enum-type': t('tree.enum_types'),
    'enum-label': t('right_panel.fields.enum_label'),
    'domain-type': t('tree.domain_types'),
    'domain-detail': t('right_panel.fields.domain_detail'),
    'domain-constraint': t('right_panel.fields.domain_constraint'),
    'composite-type': t('tree.composite_types'),
    'composite-field': t('right_panel.fields.composite_field'),
    'partition-key': t('right_panel.fields.partition_key'),
    extension: t('tree.extensions'),
    'redis-key': 'Redis Key',
    unknown: t('common.type'),
  }
  return map[type] || type
})

const detailDefinitions = computed(() => {
  const objectType = props.context?.objectType
  const definitions: Array<{ key: string; label: string }> = [
    { key: 'name', label: t('common.name') },
    { key: '__object_type', label: t('common.type') },
    { key: '__connection', label: t('right_panel.fields.connection') },
    { key: '__database', label: t('common.database') },
    { key: '__schema', label: t('right_panel.fields.schema') },
    { key: '__path', label: t('right_panel.fields.path') },
    { key: '__tab_type', label: t('right_panel.fields.tab_type') },
    { key: '__read_only', label: t('right_panel.fields.read_only') },
  ]

  if (objectType === 'database') {
    definitions.push(
      { key: 'owner', label: t('right_panel.fields.owner') },
      { key: 'tablespace', label: t('right_panel.fields.tablespace') },
      { key: 'charset', label: t('right_panel.fields.charset') },
      { key: 'collation', label: t('right_panel.fields.collation') },
      { key: 'ctype', label: t('right_panel.fields.ctype') },
      { key: 'size_bytes', label: t('right_panel.fields.database_size') },
      { key: 'allow_connections', label: t('right_panel.fields.allow_connections') },
      { key: 'connection_limit', label: t('right_panel.fields.connection_limit') },
      { key: 'is_template', label: t('right_panel.fields.is_template') },
    )
  }

  if (objectType === 'table' || objectType === 'view' || objectType === 'materialized-view') {
    definitions.push(
      { key: 'oid', label: 'OID' },
      { key: 'rows', label: t('right_panel.fields.rows') },
      { key: 'owner', label: t('right_panel.fields.owner') },
      { key: 'tablespace', label: t('right_panel.fields.tablespace') },
      { key: 'size_mb', label: t('right_panel.fields.table_size') },
      { key: 'size_bytes', label: t('right_panel.fields.storage_bytes') },
      { key: 'main_size_bytes', label: t('right_panel.fields.main_storage_size') },
      { key: 'toast_size_bytes', label: t('right_panel.fields.toast_storage_size') },
      { key: 'table_type', label: t('right_panel.fields.table_type') },
      { key: 'persistence', label: t('right_panel.fields.persistence') },
      { key: 'fillfactor', label: t('right_panel.fields.fillfactor') },
      { key: 'engine', label: t('right_panel.fields.engine') },
      { key: 'partition_key', label: t('right_panel.fields.partition_key') },
      { key: 'partition_parent', label: t('right_panel.fields.partition_parent') },
      { key: 'partition_bound', label: t('right_panel.fields.partition_bound') },
    )
  }

  if (objectType === 'index') {
    definitions.push(
      { key: 'oid', label: 'OID' },
      { key: 'table', label: t('right_panel.fields.table_name') },
      { key: 'tablespace', label: t('right_panel.fields.tablespace') },
      { key: 'size_bytes', label: t('right_panel.fields.index_size') },
      { key: 'fillfactor', label: t('right_panel.fields.fillfactor') },
      { key: 'index_type', label: t('right_panel.fields.index_type') },
      { key: 'predicate', label: t('right_panel.fields.predicate') },
    )
  }

  if (['unique-constraint', 'check-constraint', 'exclude-constraint'].includes(objectType || '')) {
    definitions.push(
      { key: 'table', label: t('right_panel.fields.table_name') },
      { key: 'constraint_type', label: t('right_panel.fields.constraint_type') },
    )
  }

  if (objectType === 'schema') {
    definitions.push(
      { key: 'oid', label: 'OID' },
      { key: 'owner', label: t('right_panel.fields.owner') },
      { key: 'comment', label: t('common.description') },
    )
  }

  if (objectType === 'column') {
    definitions.push(
      { key: 'table', label: t('right_panel.fields.table_name') },
      { key: 'data_type', label: t('right_panel.fields.data_type') },
      { key: 'collation', label: t('right_panel.fields.collation') },
      { key: 'nullable', label: t('right_panel.fields.nullable') },
      { key: 'character_maximum_length', label: t('right_panel.fields.max_length') },
      { key: 'numeric_precision', label: t('right_panel.fields.numeric_precision') },
      { key: 'numeric_scale', label: t('right_panel.fields.numeric_scale') },
      { key: 'default_value', label: t('right_panel.fields.default_value') },
      { key: 'is_identity', label: t('right_panel.fields.identity_column') },
      { key: 'identity_generation', label: t('right_panel.fields.identity_generation') },
      { key: 'generated_expression', label: t('right_panel.fields.generated_expression') },
    )
  }

  if (objectType === 'foreign-key') {
    definitions.push(
      { key: 'table', label: t('right_panel.fields.table_name') },
      { key: 'column_name', label: t('right_panel.fields.column_name') },
      { key: 'referenced_table_name', label: t('right_panel.fields.referenced_table') },
      { key: 'referenced_column_name', label: t('right_panel.fields.referenced_column') },
      { key: 'update_rule', label: t('right_panel.fields.update_rule') },
      { key: 'delete_rule', label: t('right_panel.fields.delete_rule') },
    )
  }

  if (objectType === 'trigger') {
    definitions.push(
      { key: 'table_name', label: t('right_panel.fields.table_name') },
      { key: 'timing', label: t('right_panel.fields.timing') },
      { key: 'orientation', label: t('right_panel.fields.orientation') },
      { key: 'event', label: t('right_panel.fields.event') },
      { key: 'enabled', label: t('right_panel.fields.enabled') },
    )
  }

  if (objectType === 'rule') {
    definitions.push(
      { key: 'event', label: t('right_panel.fields.event') },
      { key: 'is_instead', label: t('right_panel.fields.instead_rule') },
    )
  }

  if (['function', 'procedure', 'aggregate'].includes(objectType || '')) {
    definitions.push(
      { key: 'oid', label: 'OID' },
      { key: 'return_type', label: t('right_panel.fields.return_type') },
      { key: 'language', label: t('right_panel.fields.language') },
      { key: 'function_type', label: t('right_panel.fields.function_type') },
      { key: 'arguments', label: t('right_panel.fields.arguments') },
      { key: 'identity_arguments', label: t('right_panel.fields.identity_arguments') },
      { key: 'volatility', label: t('right_panel.fields.volatility') },
      { key: 'security_definer', label: t('right_panel.fields.security_definer') },
      { key: 'parallel', label: t('right_panel.fields.parallel') },
      { key: 'is_strict', label: t('right_panel.fields.is_strict') },
      { key: 'leakproof', label: t('right_panel.fields.leakproof') },
      { key: 'estimated_cost', label: t('right_panel.fields.estimated_cost') },
      { key: 'estimated_rows', label: t('right_panel.fields.estimated_rows') },
    )
  }

  if (objectType === 'sequence') {
    definitions.push(
      { key: 'oid', label: 'OID' },
      { key: 'data_type', label: t('right_panel.fields.data_type') },
      { key: 'increment_by', label: t('right_panel.fields.increment_by') },
      { key: 'start_value', label: t('right_panel.fields.start_value') },
      { key: 'min_value', label: t('right_panel.fields.min_value') },
      { key: 'max_value', label: t('right_panel.fields.max_value') },
      { key: 'cache_size', label: t('right_panel.fields.cache_size') },
      { key: 'cycle', label: t('right_panel.fields.cycle') },
      { key: 'last_value', label: t('right_panel.fields.last_value') },
      { key: 'next_value', label: t('right_panel.fields.next_value') },
      { key: 'is_called', label: t('right_panel.fields.is_called') },
    )
  }

  if (objectType === 'extension') {
    definitions.push(
      { key: 'oid', label: 'OID' },
      { key: 'version', label: t('right_panel.fields.version') },
      { key: 'schema', label: t('right_panel.fields.schema') },
      { key: 'relocatable', label: t('right_panel.fields.relocatable') },
    )
  }

  if (objectType === 'enum-type') {
    definitions.push(
      { key: 'oid', label: 'OID' },
    )
  }

  if (objectType === 'domain-type') {
    definitions.push(
      { key: 'oid', label: 'OID' },
      { key: 'base_type', label: t('right_panel.fields.base_type') },
      { key: 'default_value', label: t('right_panel.fields.default_value') },
      { key: 'nullable', label: t('right_panel.fields.nullable') },
    )
  }

  if (objectType === 'composite-type') {
    definitions.push({ key: 'oid', label: 'OID' })
  }

  if (objectType === 'enum-label') {
    definitions.push(
      { key: 'enum_name', label: t('right_panel.fields.enum_name') },
      { key: 'label', label: t('right_panel.fields.enum_label') },
      { key: 'oid', label: 'OID' },
    )
  }

  if (objectType === 'domain-detail' || objectType === 'domain-constraint') {
    definitions.push(
      { key: 'name', label: t('common.name') },
      { key: 'definition', label: t('tree.view_definition') },
      { key: 'constraint_type', label: t('right_panel.fields.constraint_type') },
    )
  }

  if (objectType === 'composite-field') {
    definitions.push(
      { key: 'composite_name', label: t('right_panel.fields.composite_name') },
      { key: 'name', label: t('common.name') },
      { key: 'data_type', label: t('right_panel.fields.data_type') },
      { key: 'oid', label: 'OID' },
    )
  }

  if (objectType === 'partition-key') {
    definitions.push(
      { key: 'table', label: t('right_panel.fields.table_name') },
      { key: 'partition_key', label: t('right_panel.fields.partition_key') },
    )
  }

  return definitions
})

const listRows = computed(() => {
  const rows: Array<{ label: string; value: string }> = []
  const candidates = [
    { key: 'columns', label: t('tree.columns') },
    { key: 'include_columns', label: t('right_panel.fields.include_columns') },
    { key: 'labels', label: t('right_panel.fields.labels') },
    { key: 'fields', label: t('tree.columns') },
    { key: 'constraints', label: t('right_panel.fields.constraints') },
    { key: 'partitions', label: t('tree.partitions') },
    { key: 'tags', label: t('right_panel.fields.tags') },
  ]

  for (const item of candidates) {
    const values = normalizeList(metadata.value[item.key])
    for (const value of values) {
      rows.push({ label: item.label, value })
    }
  }

  return rows
})

const allRows = computed(() => {
  const baseRows = detailDefinitions.value
    .map(item => ({
      label: item.label,
      value: resolveValue(item.key),
    }))
    .filter(item => item.value !== '')

  const rows = [...baseRows, ...listRows.value]

  if (badgeItems.value.length > 0) {
    rows.push({ label: t('right_panel.fields.badges'), value: badgeItems.value.join(', ') })
  }

  if (definitionText.value) {
    rows.push({ label: t('tree.view_definition'), value: definitionText.value })
  }

  if (commentText.value) {
    rows.push({ label: t('common.description'), value: commentText.value })
  }

  return rows.length > 0 ? rows : [{ label: t('common.no_data'), value: '-' }]
})

const badgeItems = computed(() => {
  const items: string[] = []
  if (metadata.value.is_primary_key) items.push('PRIMARY KEY')
  if (metadata.value.is_unique) items.push('UNIQUE')
  if (metadata.value.is_primary) items.push('PRIMARY')
  if (metadata.value.is_auto_increment) items.push('AUTO_INCREMENT')
  if (metadata.value.nullable === false) items.push('NOT NULL')
  if (metadata.value.enabled === true) items.push('ENABLED')
  if (metadata.value.is_partitioned) items.push(t('tree.partitioned_table'))
  return items
})

const definitionText = computed(() => {
  const definition = metadata.value.definition
  const argumentsText = metadata.value.arguments
  if (typeof definition === 'string' && definition.trim()) return definition
  if (props.context?.objectType === 'column') {
    const parts = [metadata.value.name, metadata.value.data_type]
    if (metadata.value.nullable === false) parts.push('NOT NULL')
    if (metadata.value.default_value) parts.push(`DEFAULT ${metadata.value.default_value}`)
    if (metadata.value.identity_generation) parts.push(`GENERATED ${metadata.value.identity_generation} AS IDENTITY`)
    if (metadata.value.generated_expression) parts.push(`GENERATED ALWAYS AS (${metadata.value.generated_expression}) STORED`)
    if (metadata.value.is_primary_key) parts.push('PRIMARY KEY')
    if (metadata.value.is_auto_increment) parts.push('AUTO_INCREMENT')
    return parts.filter(Boolean).join(' ')
  }
  if (['function', 'procedure', 'aggregate'].includes(props.context?.objectType || '') && metadata.value.name) {
    return `${metadata.value.name}(${argumentsText || ''})`
  }
  return ''
})

const commentText = computed(() => props.context?.objectType === 'schema' ? '' : normalizeDisplayValue(metadata.value.comment) || '')

function resolveValue(key: string) {
  if (key === '__object_type') return objectTypeLabel.value
  if (key === '__connection') return props.context?.connectionName || props.context?.connectionId || '-'
  if (key === '__database') return props.context?.database || '-'
  if (key === '__schema') return props.context?.schema || '-'
  if (key === '__path') {
    return [props.context?.connectionName || props.context?.connectionId, props.context?.database, props.context?.schema, props.context?.objectName]
      .filter(Boolean)
      .join(' / ')
  }
  if (key === '__tab_type') return props.context?.tabType || '-'
  if (key === '__read_only') return props.context?.readOnly ? t('common.yes') : t('common.no')
  if (key === 'size_mb') {
    const sizeMb = Number(metadata.value.size_mb)
    if (Number.isFinite(sizeMb)) return formatStorageSize(sizeMb * 1024 * 1024)
    return formatStorageSize(Number(metadata.value.size_bytes))
  }
  if (key === 'size_bytes') return formatStorageSize(Number(metadata.value.size_bytes))
  if (key === 'main_size_bytes') return formatStorageSize(Number(metadata.value.main_size_bytes))
  if (key === 'toast_size_bytes') return formatStorageSize(Number(metadata.value.toast_size_bytes))
  if (key === 'schema' && typeof metadata.value.schema === 'string') return metadata.value.schema
  return normalizeDisplayValue(metadata.value[key])
}

function normalizeDisplayValue(value: unknown) {
  if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no')
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' && value.trim() === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (Array.isArray(value)) return value.map(item => normalizeListItem(item)).join(', ')
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(item => normalizeListItem(item)).filter(Boolean)
}

function normalizeListItem(item: unknown): string {
  if (typeof item === 'string') return item
  if (typeof item === 'number' || typeof item === 'boolean') return String(item)
  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>
    if (record.name && record.definition) return `${record.name}: ${record.definition}`
    if (record.name && record.data_type) return `${record.name}: ${record.data_type}`
    if (record.name && record.bound) return `${record.name}: ${record.bound}`
    return String(record.name || record.label || record.column_name || record.data_type || JSON.stringify(record))
  }
  return ''
}

function formatStorageSize(sizeInBytes?: number | null) {
  if (sizeInBytes === null || sizeInBytes === undefined || Number.isNaN(sizeInBytes) || sizeInBytes < 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let value = sizeInBytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const displayValue = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
  return `${displayValue}${units[unitIndex]}`
}
</script>

<style scoped>
.panel-shell { display: grid; gap: 12px; align-content: start; }
.panel-header { display: grid; gap: 4px; }
.panel-title {
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
  word-break: break-word;
}
.panel-subtitle {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--app-text-subtle);
  font-size: 12px;
}
.panel-subtitle__divider { opacity: 0.6; }
.property-table-wrap {
  overflow-x: auto;
  border: 1px solid color-mix(in srgb, var(--border-color) 82%, transparent);
  border-radius: 10px;
  background: var(--surface);
}
.property-table {
  min-width: 640px;
}
.property-row {
  display: grid;
  grid-template-columns: 150px minmax(360px, 1fr);
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 72%, transparent);
}
.property-row:last-child { border-bottom: 0; }
.property-row--head {
  background: color-mix(in srgb, var(--surface-hover) 65%, white 10%);
  color: var(--app-text-subtle);
  font-size: 12px;
  font-weight: 600;
}
.property-key,
.property-value {
  padding: 9px 12px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
}
.property-row--head > div {
  padding: 9px 12px;
}
.property-key {
  color: var(--app-text-subtle);
  font-size: 12px;
}
.property-value {
  color: var(--app-text);
  font-size: 12px;
}
.panel-title,
.panel-subtitle,
.panel-subtitle__divider,
.property-row--head,
.property-key,
.property-value {
  user-select: text !important;
  -webkit-user-select: text !important;
}
</style>
