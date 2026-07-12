import { metadataApi } from '@/api'
import type { TreeNode } from './treeModel'

/**
 * 树节点懒加载（对等 Vue 版 DatabaseTree.vue 的 onLoadData，按迁移计划拆出为独立文件）。
 * 各引擎层级差异：MySQL 四分组（表/视图/函数/存储过程）/ PG 系 schema 树（含扩展与类型）/
 * 其余引擎两分组（表/视图）/ SQLite 单 main 库 / Redis·Mongo 数据库为叶子。
 * key 编码规则逐字保留（红线 R3）。
 */

export interface TreeLoaderContext {
  connectionId: string
  normalizedDbType: string
  isPgLike: boolean
  supportsDatabaseTreeChildren: boolean
  t: (key: string, options?: Record<string, unknown>) => string
}

export function formatTableNodeTitle(table: any, t: TreeLoaderContext['t']) {
  const badges = []
  if (table.is_partitioned) badges.push(t('tree.partitioned_table'))
  else if (table.partition_parent) badges.push(t('tree.partition'))

  const details = [...badges]
  return details.length ? `${table.name} · ${details.join(' · ')}` : table.name
}

function emptyChild(parentKey: string, t: TreeLoaderContext['t']): TreeNode {
  return { key: `${parentKey}-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }
}

/**
 * 加载节点子级；返回 null 表示该节点类型无需加载。
 * API 错误向上抛出，由调用方统一 message.error。
 */
export async function loadNodeChildren(ctx: TreeLoaderContext, treeNode: TreeNode): Promise<TreeNode[] | null> {
  const { connectionId: connId, t } = ctx

  if (treeNode.type === 'database') {
    if (!ctx.supportsDatabaseTreeChildren) return null

    const dbName = treeNode.metadata.name
    if (ctx.isPgLike) {
      return [
        { key: `${treeNode.key}-schemas`, title: 'Schemas', type: 'schemas', isLeaf: false, metadata: { database: dbName } },
        { key: `${treeNode.key}-extensions`, title: t('tree.extensions'), type: 'database-extensions', isLeaf: false, metadata: { database: dbName } },
      ]
    }
    if (ctx.normalizedDbType === 'mysql') {
      return [
        { key: `${treeNode.key}-tables`, title: t('tree.tables'), type: 'tables', isLeaf: false, metadata: { database: dbName } },
        { key: `${treeNode.key}-views`, title: t('tree.views'), type: 'views', isLeaf: false, metadata: { database: dbName } },
        { key: `${treeNode.key}-functions`, title: t('tree.functions'), type: 'functions', isLeaf: false, metadata: { database: dbName, schema: dbName } },
        { key: `${treeNode.key}-procedures`, title: t('tree.procedures'), type: 'procedures', isLeaf: false, metadata: { database: dbName, schema: dbName } },
      ]
    }
    return [
      { key: `${treeNode.key}-tables`, title: t('tree.tables'), type: 'tables', isLeaf: false, metadata: { database: dbName } },
      { key: `${treeNode.key}-views`, title: t('tree.views'), type: 'views', isLeaf: false, metadata: { database: dbName } },
    ]
  }

  if (treeNode.type === 'schemas') {
    const res = await metadataApi.getSchemas(connId, treeNode.metadata.database)
    return res.map((s) => ({
      key: `${treeNode.key}-${s.name}`,
      title: s.name,
      type: 'schema',
      isLeaf: false,
      metadata: { ...s, database: treeNode.metadata.database, name: s.name },
    }))
  }

  if (treeNode.type === 'schema') {
    const db = treeNode.metadata.database
    const schema = treeNode.metadata.name
    return [
      { key: `${treeNode.key}-tables`, title: t('tree.tables'), type: 'schema-tables', isLeaf: false, metadata: { database: db, schema } },
      { key: `${treeNode.key}-views`, title: t('tree.views'), type: 'schema-views', isLeaf: false, metadata: { database: db, schema } },
      { key: `${treeNode.key}-materialized-views`, title: t('tree.materialized_views'), type: 'schema-materialized-views', isLeaf: false, metadata: { database: db, schema } },
      { key: `${treeNode.key}-functions`, title: t('tree.functions'), type: 'schema-functions', isLeaf: false, metadata: { database: db, schema } },
      { key: `${treeNode.key}-sequences`, title: t('tree.sequences'), type: 'schema-sequences', isLeaf: false, metadata: { database: db, schema } },
      ...(ctx.isPgLike ? [{ key: `${treeNode.key}-enum-types`, title: t('tree.enum_types'), type: 'schema-enum-types', isLeaf: false, metadata: { database: db, schema } }] : []),
      ...(ctx.isPgLike ? [{ key: `${treeNode.key}-domain-types`, title: t('tree.domain_types'), type: 'schema-domain-types', isLeaf: false, metadata: { database: db, schema } }] : []),
      ...(ctx.isPgLike ? [{ key: `${treeNode.key}-composite-types`, title: t('tree.composite_types'), type: 'schema-composite-types', isLeaf: false, metadata: { database: db, schema } }] : []),
      ...(ctx.normalizedDbType === 'mysql' ? [{ key: `${treeNode.key}-procedures`, title: t('tree.procedures'), type: 'schema-procedures', isLeaf: false, metadata: { database: db, schema } }] : []),
      { key: `${treeNode.key}-aggregates`, title: t('tree.aggregates'), type: 'schema-aggregates', isLeaf: false, metadata: { database: db, schema } },
    ]
  }

  if (['schema-tables', 'schema-views', 'schema-materialized-views', 'tables', 'views'].includes(treeNode.type)) {
    const isSchema = treeNode.type.startsWith('schema-')
    const isMaterializedViews = treeNode.type === 'schema-materialized-views'
    const isViews = treeNode.type.includes('views') && !isMaterializedViews

    let res: any[]
    if (isMaterializedViews) {
      res = await metadataApi.getSchemaMaterializedViews(connId, treeNode.metadata.database, treeNode.metadata.schema)
    } else if (isViews) {
      res = isSchema
        ? await metadataApi.getSchemaViews(connId, treeNode.metadata.database, treeNode.metadata.schema)
        : await metadataApi.getViews(connId, treeNode.metadata.database)
    } else if (isSchema) {
      res = await metadataApi.getSchemaTables(connId, treeNode.metadata.database, treeNode.metadata.schema)
    } else {
      res = await metadataApi.getTables(connId, treeNode.metadata.database)
    }
    const children = res.map((table) => ({
      key: `${treeNode.key}-${table.name}`,
      title: formatTableNodeTitle(table, t),
      type: isMaterializedViews ? 'materialized-view' : isViews ? 'view' : 'table',
      isLeaf: false,
      metadata: { ...table, database: treeNode.metadata.database, schema: treeNode.metadata.schema },
    }))
    return children.length ? children : [emptyChild(treeNode.key, t)]
  }

  if (['schema-functions', 'schema-procedures', 'schema-aggregates', 'schema-sequences', 'schema-enum-types', 'schema-domain-types', 'schema-composite-types', 'database-extensions', 'functions', 'procedures'].includes(treeNode.type)) {
    const isFunction = treeNode.type === 'schema-functions' || treeNode.type === 'functions'
    const isProcedure = treeNode.type === 'schema-procedures' || treeNode.type === 'procedures'
    const isAggregate = treeNode.type === 'schema-aggregates'
    const isSequence = treeNode.type === 'schema-sequences'
    const isEnumType = treeNode.type === 'schema-enum-types'
    const isDomainType = treeNode.type === 'schema-domain-types'
    const isCompositeType = treeNode.type === 'schema-composite-types'

    let res: any[]
    if (isFunction) {
      res = await metadataApi.getSchemaFunctions(connId, treeNode.metadata.database, treeNode.metadata.schema || treeNode.metadata.database)
    } else if (isProcedure) {
      res = await metadataApi.getSchemaProcedures(connId, treeNode.metadata.database, treeNode.metadata.schema || treeNode.metadata.database)
    } else if (isAggregate) {
      res = await metadataApi.getSchemaAggregateFunctions(connId, treeNode.metadata.database, treeNode.metadata.schema)
    } else if (isSequence) {
      res = await metadataApi.getSchemaSequences(connId, treeNode.metadata.database, treeNode.metadata.schema)
    } else if (isEnumType) {
      res = await metadataApi.getSchemaEnumTypes(connId, treeNode.metadata.database, treeNode.metadata.schema)
    } else if (isDomainType) {
      res = await metadataApi.getSchemaDomainTypes(connId, treeNode.metadata.database, treeNode.metadata.schema)
    } else if (isCompositeType) {
      res = await metadataApi.getSchemaCompositeTypes(connId, treeNode.metadata.database, treeNode.metadata.schema)
    } else {
      res = await metadataApi.getDatabaseExtensions(connId, treeNode.metadata.database)
    }

    const children = res.map((item) => {
      let title = item.name || item.index_name
      const routineKeyPart = item.oid != null ? `oid-${item.oid}` : `${item.name || item.index_name}-${item.identity_arguments || item.arguments || ''}`

      if ((isFunction || isProcedure || isAggregate) && item.arguments) {
        title = `${item.name}(${item.arguments})`
      }

      if (isEnumType) {
        const labelChildren = Array.isArray(item.labels)
          ? item.labels.map((label: string, index: number) => ({
              key: `${treeNode.key}-oid-${item.oid ?? item.name}-label-${index}`,
              title: label,
              type: 'enum-label',
              isLeaf: true,
              metadata: { label, database: treeNode.metadata.database, schema: treeNode.metadata.schema, enum_name: item.name, oid: item.oid },
            }))
          : []
        return {
          key: `${treeNode.key}-oid-${item.oid ?? item.name}`,
          title,
          type: 'enum-type',
          isLeaf: false,
          children: labelChildren.length ? labelChildren : [{ key: `${treeNode.key}-oid-${item.oid ?? item.name}-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }],
          metadata: { ...item, database: treeNode.metadata.database, schema: treeNode.metadata.schema },
        }
      }

      if (isDomainType) {
        return {
          key: `${treeNode.key}-oid-${item.oid ?? item.name}`,
          title,
          type: 'domain-type',
          isLeaf: true,
          metadata: { ...item, database: treeNode.metadata.database, schema: treeNode.metadata.schema },
        }
      }

      if (isCompositeType) {
        const fieldChildren = Array.isArray(item.fields)
          ? item.fields.map((field: any, index: number) => ({
              key: `${treeNode.key}-oid-${item.oid ?? item.name}-field-${index}`,
              title: `${field.name} : ${field.data_type}`,
              type: 'composite-field',
              isLeaf: true,
              metadata: { ...field, database: treeNode.metadata.database, schema: treeNode.metadata.schema, composite_name: item.name, oid: item.oid },
            }))
          : []
        return {
          key: `${treeNode.key}-oid-${item.oid ?? item.name}`,
          title,
          type: 'composite-type',
          isLeaf: false,
          children: fieldChildren.length ? fieldChildren : [{ key: `${treeNode.key}-oid-${item.oid ?? item.name}-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }],
          metadata: { ...item, database: treeNode.metadata.database, schema: treeNode.metadata.schema },
        }
      }

      return {
        key: `${treeNode.key}-${routineKeyPart}`,
        title,
        type: isFunction ? 'function' : isProcedure ? 'procedure' : isAggregate ? 'aggregate' : isSequence ? 'sequence' : 'extension',
        isLeaf: true,
        metadata: { ...item, database: treeNode.metadata.database, schema: treeNode.metadata.schema },
      }
    })
    return children.length ? children : [emptyChild(treeNode.key, t)]
  }

  if (['table', 'view', 'materialized-view'].includes(treeNode.type)) {
    const [columns, indexes, foreignKeys, triggers, constraints, rules] = await Promise.all([
      metadataApi.getTableStructure({ connectionId: connId, table: treeNode.metadata.name || treeNode.title, database: treeNode.metadata.database, schema: treeNode.metadata.schema }),
      treeNode.type === 'table'
        ? metadataApi.getTableIndexes({ connectionId: connId, table: treeNode.metadata.name || treeNode.title, schema: treeNode.metadata.schema })
        : Promise.resolve([]),
      treeNode.type === 'table'
        ? metadataApi.getTableForeignKeys({ connectionId: connId, table: treeNode.metadata.name || treeNode.title, schema: treeNode.metadata.schema })
        : Promise.resolve([]),
      treeNode.type === 'table'
        ? metadataApi.getTableTriggers({ connectionId: connId, table: treeNode.metadata.name || treeNode.title, database: treeNode.metadata.database, schema: treeNode.metadata.schema })
        : Promise.resolve([]),
      treeNode.type === 'table'
        ? metadataApi.getTableConstraints({ connectionId: connId, table: treeNode.metadata.name || treeNode.title, database: treeNode.metadata.database, schema: treeNode.metadata.schema })
        : Promise.resolve([]),
      treeNode.type === 'table'
        ? metadataApi.getTableRules({ connectionId: connId, table: treeNode.metadata.name || treeNode.title, database: treeNode.metadata.database, schema: treeNode.metadata.schema })
        : Promise.resolve([]),
    ])

    const columnChildren = columns.map((c) => ({
      key: `${treeNode.key}-col-${c.name}`,
      title: `${c.name}${c.data_type ? ' : ' + c.data_type : ''}${c.is_primary_key ? ' [PK]' : ''}`,
      type: 'column',
      isLeaf: true,
      metadata: { ...c, database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema, object_type: treeNode.type },
    }))

    const indexChildren = indexes.map((index) => {
      const indexFlags = [
        index.is_primary ? 'PRIMARY' : '',
        !index.is_primary && index.is_unique ? 'UNIQUE' : '',
      ].filter(Boolean)
      const indexBadge = indexFlags.length ? ` [${indexFlags.join(', ')}]` : ''
      const indexColumns = index.columns?.length ? ` (${index.columns.join(', ')})` : ''
      const includeColumns = index.include_columns?.length ? ` INCLUDE (${index.include_columns.join(', ')})` : ''
      const predicate = index.predicate ? ` WHERE ${index.predicate}` : ''

      return {
        key: `${treeNode.key}-idx-${index.name}`,
        title: `${index.name}${indexBadge}${indexColumns}${includeColumns}${predicate}`,
        type: 'index',
        isLeaf: true,
        metadata: { ...index, database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema },
      }
    })

    const foreignKeyChildren = foreignKeys.map((fk) => ({
      key: `${treeNode.key}-fk-${fk.name}`,
      title: `${fk.name} (${fk.column_name} → ${fk.referenced_table_name}.${fk.referenced_column_name})`,
      type: 'foreign-key',
      isLeaf: true,
      metadata: { ...fk, database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema },
    }))

    const triggerChildren = triggers.map((trigger) => {
      const triggerParts = [trigger.timing, trigger.event].filter(Boolean).join(' ')
      const triggerBadge = triggerParts ? ` [${triggerParts}]` : ''
      const disabledBadge = trigger.enabled === false ? ' [DISABLED]' : ''

      return {
        key: `${treeNode.key}-trigger-${trigger.name}`,
        title: `${trigger.name}${triggerBadge}${disabledBadge}`,
        type: 'trigger',
        isLeaf: true,
        metadata: { ...trigger, database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema },
      }
    })

    const makeConstraintChildren = (constraintType: string, nodeType: string) => constraints
      .filter((constraint) => constraint.constraint_type === constraintType)
      .map((constraint) => {
        const cols = constraint.columns?.length ? ` (${constraint.columns.join(', ')})` : ''
        return {
          key: `${treeNode.key}-${nodeType}-${constraint.name}`,
          title: `${constraint.name}${cols}`,
          type: nodeType,
          isLeaf: true,
          metadata: { ...constraint, database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema },
        }
      })

    const uniqueChildren = makeConstraintChildren('UNIQUE', 'unique-constraint')
    const checkChildren = makeConstraintChildren('CHECK', 'check-constraint')
    const excludeChildren = makeConstraintChildren('EXCLUDE', 'exclude-constraint')
    const ruleChildren = rules.map((rule) => {
      const ruleParts = [rule.is_instead ? 'INSTEAD' : '', rule.event].filter(Boolean).join(' ')
      const ruleBadge = ruleParts ? ` [${ruleParts}]` : ''
      return {
        key: `${treeNode.key}-rule-${rule.name}`,
        title: `${rule.name}${ruleBadge}`,
        type: 'rule',
        isLeaf: true,
        metadata: { ...rule, database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema },
      }
    })

    const partitionInfoChildren: TreeNode[] = []
    if (treeNode.metadata?.partition_key) {
      partitionInfoChildren.push({
        key: `${treeNode.key}-partition-key`,
        title: `${t('tree.partition_key')}: ${treeNode.metadata.partition_key}`,
        type: 'partition-key',
        isLeaf: true,
        metadata: { database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema, partition_key: treeNode.metadata.partition_key },
      })
    }
    const partitionChildren = (treeNode.metadata?.partitions || []).map((partition: any) => ({
      key: `${treeNode.key}-partition-${partition.schema || treeNode.metadata.schema || ''}-${partition.name}`,
      title: partition.bound ? `${partition.name} · ${partition.bound}` : partition.name,
      type: 'table',
      isLeaf: false,
      metadata: {
        ...partition,
        database: treeNode.metadata.database,
        schema: partition.schema || treeNode.metadata.schema,
        table_type: 'PARTITION',
        partition_parent: `${treeNode.metadata.schema ? `${treeNode.metadata.schema}.` : ''}${treeNode.metadata.name}`,
      },
    }))

    const meta = { database: treeNode.metadata.database, table: treeNode.metadata.name, schema: treeNode.metadata.schema }
    const groupNodes: TreeNode[] = [
      {
        key: `${treeNode.key}-columns`,
        title: t('tree.columns'),
        type: ['view', 'materialized-view'].includes(treeNode.type) ? 'view-columns' : 'table-columns',
        isLeaf: false,
        metadata: meta,
        children: columnChildren.length ? columnChildren : [{ key: `${treeNode.key}-columns-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }],
      },
    ]

    if (treeNode.type === 'table') {
      if (treeNode.metadata?.is_partitioned || treeNode.metadata?.partition_key || partitionChildren.length) {
        groupNodes.push({
          key: `${treeNode.key}-partitions`,
          title: t('tree.partitions'),
          type: 'table-partitions',
          isLeaf: false,
          metadata: meta,
          children: [...partitionInfoChildren, ...partitionChildren].length
            ? [...partitionInfoChildren, ...partitionChildren]
            : [{ key: `${treeNode.key}-partitions-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }],
        })
      }

      groupNodes.push(
        {
          key: `${treeNode.key}-indexes`,
          title: t('tree.indexes'),
          type: 'table-indexes',
          isLeaf: false,
          metadata: meta,
          children: indexChildren.length ? indexChildren : [{ key: `${treeNode.key}-indexes-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }],
        },
        {
          key: `${treeNode.key}-foreign-keys`,
          title: t('tree.foreign_keys'),
          type: 'table-foreign-keys',
          isLeaf: false,
          metadata: meta,
          children: foreignKeyChildren.length ? foreignKeyChildren : [{ key: `${treeNode.key}-foreign-keys-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }],
        },
        {
          key: `${treeNode.key}-triggers`,
          title: t('tree.triggers'),
          type: 'table-triggers',
          isLeaf: false,
          metadata: meta,
          children: triggerChildren.length ? triggerChildren : [{ key: `${treeNode.key}-triggers-empty`, title: t('tree.empty'), type: 'empty', isLeaf: true }],
        },
      )

      if (uniqueChildren.length) {
        groupNodes.push({ key: `${treeNode.key}-uniques`, title: t('tree.uniques'), type: 'table-uniques', isLeaf: false, metadata: meta, children: uniqueChildren })
      }
      if (checkChildren.length) {
        groupNodes.push({ key: `${treeNode.key}-checks`, title: t('tree.checks'), type: 'table-checks', isLeaf: false, metadata: meta, children: checkChildren })
      }
      if (excludeChildren.length) {
        groupNodes.push({ key: `${treeNode.key}-excludes`, title: t('tree.excludes'), type: 'table-excludes', isLeaf: false, metadata: meta, children: excludeChildren })
      }
      if (ruleChildren.length) {
        groupNodes.push({ key: `${treeNode.key}-rules`, title: t('tree.rules'), type: 'table-rules', isLeaf: false, metadata: meta, children: ruleChildren })
      }
    }

    return groupNodes
  }

  return null
}
