import { useTranslation } from 'react-i18next'
import { Empty } from 'antd'
import type { RightPanelContext } from '@/types/rightPanel'
import styles from './ObjectInfoPanel.module.css'

/**
 * 对象属性面板（对等 Vue 版 ObjectInfoPanel.vue）。
 * 27 种对象类型的属性组装逻辑逐行平移（纯数据映射，量大但机械）。
 */

type Meta = Record<string, unknown>
type Translate = (key: string, options?: Record<string, unknown>) => string

function formatStorageSize(sizeInBytes?: number | null): string {
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

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeListItem(item)).filter(Boolean)
}

function normalizeDisplayValue(value: unknown, t: Translate): string {
  if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no')
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' && value.trim() === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (Array.isArray(value)) return value.map((item) => normalizeListItem(item)).join(', ')
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function getObjectTypeLabel(objectType: string, t: Translate): string {
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
  return map[objectType] || objectType
}

function buildDetailDefinitions(objectType: string | undefined, t: Translate): Array<{ key: string; label: string }> {
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
    definitions.push({ key: 'oid', label: 'OID' })
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
}

interface ObjectInfoPanelProps {
  context: RightPanelContext | null
}

export default function ObjectInfoPanel({ context }: ObjectInfoPanelProps) {
  const { t } = useTranslation()

  if (!context) {
    return (
      <div className={styles.panelShell}>
        <Empty description={t('right_panel.empty')} />
      </div>
    )
  }

  const metadata: Meta = context.metadata || {}
  const objectType = context.objectType
  const objectTypeLabel = getObjectTypeLabel(objectType || 'unknown', t)

  const resolveValue = (key: string): string => {
    if (key === '__object_type') return objectTypeLabel
    if (key === '__connection') return context.connectionName || context.connectionId || '-'
    if (key === '__database') return context.database || '-'
    if (key === '__schema') return context.schema || '-'
    if (key === '__path') {
      return [context.connectionName || context.connectionId, context.database, context.schema, context.objectName]
        .filter(Boolean)
        .join(' / ')
    }
    if (key === '__tab_type') return context.tabType || '-'
    if (key === '__read_only') return context.readOnly ? t('common.yes') : t('common.no')
    if (key === 'size_mb') {
      const sizeMb = Number(metadata.size_mb)
      if (Number.isFinite(sizeMb)) return formatStorageSize(sizeMb * 1024 * 1024)
      return formatStorageSize(Number(metadata.size_bytes))
    }
    if (key === 'size_bytes') return formatStorageSize(Number(metadata.size_bytes))
    if (key === 'main_size_bytes') return formatStorageSize(Number(metadata.main_size_bytes))
    if (key === 'toast_size_bytes') return formatStorageSize(Number(metadata.toast_size_bytes))
    if (key === 'schema' && typeof metadata.schema === 'string') return metadata.schema
    return normalizeDisplayValue(metadata[key], t)
  }

  const badgeItems: string[] = (() => {
    const items: string[] = []
    if (metadata.is_primary_key) items.push('PRIMARY KEY')
    if (metadata.is_unique) items.push('UNIQUE')
    if (metadata.is_primary) items.push('PRIMARY')
    if (metadata.is_auto_increment) items.push('AUTO_INCREMENT')
    if (metadata.nullable === false) items.push('NOT NULL')
    if (metadata.enabled === true) items.push('ENABLED')
    if (metadata.is_partitioned) items.push(t('tree.partitioned_table'))
    return items
  })()

  const definitionText: string = (() => {
    const definition = metadata.definition
    const argumentsText = metadata.arguments
    if (typeof definition === 'string' && definition.trim()) return definition
    if (objectType === 'column') {
      const parts: unknown[] = [metadata.name, metadata.data_type]
      if (metadata.nullable === false) parts.push('NOT NULL')
      if (metadata.default_value) parts.push(`DEFAULT ${metadata.default_value}`)
      if (metadata.identity_generation) parts.push(`GENERATED ${metadata.identity_generation} AS IDENTITY`)
      if (metadata.generated_expression) parts.push(`GENERATED ALWAYS AS (${metadata.generated_expression}) STORED`)
      if (metadata.is_primary_key) parts.push('PRIMARY KEY')
      if (metadata.is_auto_increment) parts.push('AUTO_INCREMENT')
      return parts.filter(Boolean).join(' ')
    }
    if (['function', 'procedure', 'aggregate'].includes(objectType || '') && metadata.name) {
      return `${metadata.name}(${argumentsText || ''})`
    }
    return ''
  })()

  const commentText: string = objectType === 'schema' ? '' : normalizeDisplayValue(metadata.comment, t) || ''

  const listRows: Array<{ label: string; value: string }> = (() => {
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
      for (const value of normalizeList(metadata[item.key])) {
        rows.push({ label: item.label, value })
      }
    }
    return rows
  })()

  const allRows: Array<{ label: string; value: string }> = (() => {
    const baseRows = buildDetailDefinitions(objectType, t)
      .map((item) => ({ label: item.label, value: resolveValue(item.key) }))
      .filter((item) => item.value !== '')

    const rows = [...baseRows, ...listRows]

    if (badgeItems.length > 0) rows.push({ label: t('right_panel.fields.badges'), value: badgeItems.join(', ') })
    if (definitionText) rows.push({ label: t('tree.view_definition'), value: definitionText })
    if (commentText) rows.push({ label: t('common.description'), value: commentText })

    return rows.length > 0 ? rows : [{ label: t('common.no_data'), value: '-' }]
  })()

  return (
    <div className={styles.panelShell}>
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle}>{context.objectName || '-'}</div>
        <div className={styles.panelSubtitle}>
          <span>{objectTypeLabel}</span>
          <span className={styles.panelSubtitleDivider}>·</span>
          <span>{context.connectionName || context.connectionId || '-'}</span>
          <span className={styles.panelSubtitleDivider}>·</span>
          <span>{context.database || '-'}</span>
        </div>
      </div>

      <div className={styles.propertyTableWrap}>
        <div className={styles.propertyTable}>
          <div className={`${styles.propertyRow} ${styles.propertyRowHead}`}>
            <div>{t('common.title')}</div>
            <div>{t('common.description')}</div>
          </div>
          {allRows.map((item, index) => (
            <div key={`${item.label}-${index}`} className={styles.propertyRow}>
              <div className={styles.propertyKey}>{item.label}</div>
              <div className={styles.propertyValue}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
