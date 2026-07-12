import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Col, Divider, Form, Input, InputNumber, Row, Select, Space, Tag } from 'antd'
import { CaretRightOutlined, CopyOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { message } from '../../ui/antd'
import { metadataApi } from '@/api'
import { useConnectionStore } from '../../stores/connectionStore'
import type { ColumnInfo, DatabaseInfo, DatabaseType, TableInfo } from '@/types/database'
import { writeClipboardText } from '@/utils/clipboard'
import styles from './QueryBuilder.module.css'

/**
 * 查询构建器（对等 Vue 版 QueryBuilder.vue：纯前端 SQL 拼接，quoting 方言规则照抄）。
 * "执行"是开新查询 tab 填 SQL 的现状语义，不直接执行。
 */

interface WhereCondition {
  column: string
  operator: string
  value: string
  logic: string
}

interface QueryBuilderProps {
  connectionId: string | null
  initialDatabase?: string | null
  onExecuteQuery: (payload: { sql: string; database?: string }) => void
}

const OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN', 'IS NULL', 'IS NOT NULL']

export default function QueryBuilder({ connectionId, initialDatabase, onExecuteQuery }: QueryBuilderProps) {
  const { t } = useTranslation()

  const currentConnection = useConnectionStore((s) => (connectionId ? s.connections.find((item) => item.id === connectionId) || null : null))
  const currentDbType: DatabaseType | null = currentConnection?.db_type || null

  const [databases, setDatabases] = useState<DatabaseInfo[]>([])
  const [selectedDatabase, setSelectedDatabase] = useState('')
  const [tables, setTables] = useState<TableInfo[]>([])
  const [mainTable, setMainTable] = useState('')
  const [columns, setColumns] = useState<ColumnInfo[]>([])
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [conditions, setConditions] = useState<WhereCondition[]>([])
  const [orderByColumn, setOrderByColumn] = useState('')
  const [orderDirection, setOrderDirection] = useState('ASC')
  const [limitRows, setLimitRows] = useState(100)

  function buildTableKey(table: TableInfo) {
    return `${table.schema || ''}:${table.name}`
  }

  function formatTableLabel(table: TableInfo) {
    return table.schema ? `${table.schema}.${table.name}` : table.name
  }

  const selectedTableInfo = tables.find((table) => buildTableKey(table) === mainTable) || null

  function quoteIdentifier(name: string) {
    if (currentDbType === 'mysql') return `\`${name}\``
    return `"${name.replace(/"/g, '""')}"`
  }

  function buildMainTableSql() {
    if (!selectedTableInfo) return ''
    if (currentDbType === 'postgresql' || currentDbType === 'opengauss' || currentDbType === 'gaussdb') {
      return `${quoteIdentifier(selectedTableInfo.schema || 'public')}.${quoteIdentifier(selectedTableInfo.name)}`
    }
    if (currentDbType === 'mysql') {
      return `${quoteIdentifier(selectedDatabase)}.${quoteIdentifier(selectedTableInfo.name)}`
    }
    return quoteIdentifier(selectedTableInfo.name)
  }

  const generatedSql = useMemo(() => {
    if (!selectedDatabase || !selectedTableInfo) {
      return t('tools.query_builder.placeholder_sql')
    }

    let sql = 'SELECT '
    if (selectedColumns.length === 0) {
      sql += '*'
    } else {
      sql += selectedColumns.map((col) => quoteIdentifier(col)).join(', ')
    }

    sql += `\nFROM ${buildMainTableSql()}`

    if (conditions.length > 0) {
      const whereConditions = conditions
        .filter((c) => c.column && c.operator)
        .map((c, index) => {
          let condition = ''
          if (c.operator === 'IS NULL' || c.operator === 'IS NOT NULL') {
            condition = `${quoteIdentifier(c.column)} ${c.operator}`
          } else if (c.operator === 'LIKE') {
            condition = `${quoteIdentifier(c.column)} LIKE '%${c.value}%'`
          } else if (c.operator === 'IN') {
            condition = `${quoteIdentifier(c.column)} IN (${c.value})`
          } else {
            condition = `${quoteIdentifier(c.column)} ${c.operator} '${c.value}'`
          }
          if (index > 0 && c.logic) {
            return `${c.logic} ${condition}`
          }
          return condition
        })

      if (whereConditions.length > 0) {
        sql += `\nWHERE ${whereConditions.join('\n  ')}`
      }
    }

    if (orderByColumn) {
      sql += `\nORDER BY ${quoteIdentifier(orderByColumn)} ${orderDirection}`
    }

    sql += `\nLIMIT ${limitRows}`
    sql += ';'
    return sql
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDatabase, selectedTableInfo, selectedColumns, conditions, orderByColumn, orderDirection, limitRows, currentDbType, t])

  async function loadTables(database: string) {
    setMainTable('')
    setTables([])
    setColumns([])
    setSelectedColumns([])
    setConditions([])
    setOrderByColumn('')
    if (!database || !connectionId) return
    try {
      setTables(await metadataApi.getTables(connectionId, database))
    } catch (error: unknown) {
      message.error(t('tools.query_builder.load_table_fail', { error: String(error) }))
    }
  }

  async function loadTableColumns(tableKey: string) {
    const tableInfo = tables.find((table) => buildTableKey(table) === tableKey) || null
    if (!tableInfo || !selectedDatabase || !connectionId) return
    try {
      const cols = await metadataApi.getTableStructure({
        connectionId,
        table: tableInfo.name,
        schema: tableInfo.schema || null,
        database: selectedDatabase,
      })
      setColumns(cols)
      setSelectedColumns([])
      setConditions([])
    } catch (error: unknown) {
      message.error(t('tools.query_builder.load_column_fail', { error: String(error) }))
    }
  }

  // 连接变化：重置并加载（对等 watch immediate）
  useEffect(() => {
    setDatabases([])
    setSelectedDatabase('')
    setTables([])
    setMainTable('')
    setColumns([])
    setSelectedColumns([])
    setConditions([])
    setOrderByColumn('')
    if (!connectionId) return
    void (async () => {
      try {
        const dbs = await metadataApi.getDatabases(connectionId)
        setDatabases(dbs)
        if (initialDatabase && dbs.some((db) => db.name === initialDatabase)) {
          setSelectedDatabase(initialDatabase)
          await loadTables(initialDatabase)
        } else if (dbs.length === 1) {
          setSelectedDatabase(dbs[0].name)
          await loadTables(dbs[0].name)
        }
      } catch (error: unknown) {
        message.error(t('tools.query_builder.load_db_fail', { error: String(error) }))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId])

  function patchCondition(index: number, patch: Partial<WhereCondition>) {
    setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  async function copySql() {
    await writeClipboardText(generatedSql)
    message.success(t('tools.query_builder.copy_success'))
  }

  function executeSql() {
    onExecuteQuery({ sql: generatedSql, database: selectedDatabase })
    message.success(t('tools.query_builder.execute_success'))
  }

  return (
    <div className={styles.queryBuilder}>
      <div className={`section-header ${styles.builderHeader}`}>
        <h3>{t('tools.query_builder.title')}</h3>
        <p>{t('tools.query_builder.subtitle')}</p>
      </div>

      <div className={styles.builderConfig}>
        <Form layout="vertical">
          <Form.Item label={t('tools.query_builder.database')}>
            <Select
              value={selectedDatabase || undefined}
              placeholder={t('tools.query_builder.database_placeholder')}
              onChange={(v) => { setSelectedDatabase(String(v)); void loadTables(String(v)) }}
              options={databases.map((db) => ({ value: db.name, label: db.name }))}
            />
          </Form.Item>
          <Form.Item label={t('tools.query_builder.main_table')}>
            <Select
              value={mainTable || undefined}
              placeholder={t('tools.query_builder.main_table_placeholder')}
              disabled={!selectedDatabase}
              onChange={(v) => { setMainTable(String(v)); void loadTableColumns(String(v)) }}
              options={tables.map((table) => ({ value: buildTableKey(table), label: formatTableLabel(table) }))}
            />
          </Form.Item>
        </Form>

        <Divider>{t('tools.query_builder.query_config')}</Divider>

        <div className={`info-panel ${styles.querySection}`}>
          <h4>{t('tools.query_builder.select_columns')}</h4>
          <Checkbox.Group
            value={selectedColumns}
            onChange={(vals) => setSelectedColumns(vals as string[])}
            className={styles.columnsGroup}
          >
            <Row>
              {columns.map((col) => (
                <Col span={8} key={col.name} className={styles.columnOption}>
                  <Checkbox value={col.name}>
                    {col.name}
                    <Tag className={styles.columnTypeTag}>{col.data_type}</Tag>
                  </Checkbox>
                </Col>
              ))}
            </Row>
          </Checkbox.Group>
          <Button size="small" onClick={() => setSelectedColumns(columns.map((col) => col.name))} className={styles.selectColumnsBtn}>
            {t('common.select_all')}
          </Button>
          <Button size="small" onClick={() => setSelectedColumns([])} className={styles.clearColumnsBtn}>
            {t('common.clear')}
          </Button>
        </div>

        <div className={`info-panel ${styles.querySection}`}>
          <h4>
            {t('tools.query_builder.where_conditions')}
            <Button size="small" type="link" onClick={() => setConditions((prev) => [...prev, { column: '', operator: '=', value: '', logic: 'AND' }])}>
              <PlusOutlined /> {t('tools.query_builder.add_condition')}
            </Button>
          </h4>
          {conditions.map((condition, index) => (
            <div key={index} className={styles.conditionRow}>
              <div className={styles.conditionGrid}>
                <div className={styles.conditionField}>
                  <Select
                    value={condition.column || undefined}
                    placeholder={t('tools.query_builder.column')}
                    onChange={(v) => patchCondition(index, { column: String(v) })}
                    options={columns.map((col) => ({ value: col.name, label: col.name }))}
                  />
                </div>
                <div className={styles.conditionField}>
                  <Select
                    value={condition.operator}
                    placeholder={t('tools.query_builder.operator')}
                    onChange={(v) => patchCondition(index, { operator: String(v) })}
                    options={OPERATORS.map((op) => ({ value: op, label: op }))}
                  />
                </div>
                <div className={styles.conditionField}>
                  <Input
                    value={condition.value}
                    placeholder={t('tools.query_builder.value_label')}
                    disabled={condition.operator === 'IS NULL' || condition.operator === 'IS NOT NULL'}
                    onChange={(e) => patchCondition(index, { value: e.target.value })}
                  />
                </div>
                <div className={styles.conditionField}>
                  <Select
                    value={condition.logic}
                    placeholder={t('tools.query_builder.logic')}
                    onChange={(v) => patchCondition(index, { logic: String(v) })}
                    options={[{ value: 'AND', label: 'AND' }, { value: 'OR', label: 'OR' }]}
                  />
                </div>
                <div className={`${styles.conditionField} ${styles.conditionAction}`}>
                  <Button type="text" danger onClick={() => setConditions((prev) => prev.filter((_, i) => i !== index))}>
                    <DeleteOutlined />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={`info-panel ${styles.querySection}`}>
          <h4>{t('tools.query_builder.order_by')}</h4>
          <div className={styles.orderGrid}>
            <div className={`${styles.orderField} ${styles.orderColumn}`}>
              <Select
                value={orderByColumn || undefined}
                placeholder={t('tools.query_builder.order_column')}
                allowClear
                onChange={(v) => setOrderByColumn(String(v ?? ''))}
                options={columns.map((col) => ({ value: col.name, label: col.name }))}
              />
            </div>
            <div className={`${styles.orderField} ${styles.orderDirection}`}>
              <Select
                value={orderDirection}
                placeholder={t('tools.query_builder.order_direction')}
                onChange={(v) => setOrderDirection(String(v))}
                options={[
                  { value: 'ASC', label: t('tools.query_builder.asc') },
                  { value: 'DESC', label: t('tools.query_builder.desc') },
                ]}
              />
            </div>
          </div>
        </div>

        <div className={`info-panel ${styles.querySection}`}>
          <h4>{t('tools.query_builder.limit_rows')}</h4>
          <InputNumber value={limitRows} min={1} max={10000} onChange={(v) => setLimitRows(Number(v || 100))} className={styles.limitInput} />
        </div>
      </div>

      <div className={styles.generatedSql}>
        <Divider>{t('tools.query_builder.generated_sql')}</Divider>
        <div className={`code-preview-panel ${styles.sqlPreview}`}>
          <pre>{generatedSql}</pre>
          <div className={styles.sqlActions}>
            <Space>
              <Button onClick={() => void copySql()}>
                <CopyOutlined /> {t('common.copy')}
              </Button>
              <Button type="primary" onClick={executeSql}>
                <CaretRightOutlined /> {t('common.execute')}
              </Button>
            </Space>
          </div>
        </div>
      </div>
    </div>
  )
}
