import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Card, Checkbox, Col, Descriptions, Empty, Form, List, Row, Select, Space, Tabs, Tag } from 'antd'
import { RetweetOutlined } from '@ant-design/icons'
import { message } from '../../ui/antd'
import { metadataApi, queryApi } from '@/api'
import { useConnectionStore } from '../../stores/connectionStore'
import type { ColumnInfo, DatabaseInfo, DatabaseType, TableInfo } from '@/types/database'
import styles from './DataCompare.module.css'

/**
 * 数据对比（对等 Vue 版 DataCompare.vue）。
 * 现状"简化对比"平移（结构：列数/缺列/类型；数据：两侧 COUNT(*) 之差——已知业务问题 4 不修）；
 * "生成同步脚本 = 开发中"提示保留。
 */

interface StructureDetail {
  type: string
  message: string
}

interface ComparisonResultData {
  structureDiff: number
  dataDiff: number
  missingRows: number
  extraRows: number
  structureDetails: StructureDetail[]
}

interface DataCompareProps {
  connectionId: string | null
  initialDatabase?: string | null
}

export default function DataCompare({ connectionId, initialDatabase }: DataCompareProps) {
  const { t } = useTranslation()

  const currentConnection = useConnectionStore((s) => (connectionId ? s.connections.find((item) => item.id === connectionId) || null : null))
  const currentDbType: DatabaseType | null = currentConnection?.db_type || null

  const [databases, setDatabases] = useState<DatabaseInfo[]>([])
  const [sourceDatabase, setSourceDatabase] = useState('')
  const [targetDatabase, setTargetDatabase] = useState('')
  const [sourceTable, setSourceTable] = useState('')
  const [targetTable, setTargetTable] = useState('')
  const [sourceTables, setSourceTables] = useState<TableInfo[]>([])
  const [targetTables, setTargetTables] = useState<TableInfo[]>([])
  const [comparing, setComparing] = useState(false)
  const [compareStructure, setCompareStructure] = useState(true)
  const [compareData, setCompareData] = useState(true)
  const [comparisonResult, setComparisonResult] = useState<ComparisonResultData | null>(null)

  function buildTableKey(table: TableInfo) {
    return `${table.schema || ''}:${table.name}`
  }

  function formatTableLabel(table: TableInfo) {
    return table.schema ? `${table.schema}.${table.name}` : table.name
  }

  const selectedSourceTable = sourceTables.find((table) => buildTableKey(table) === sourceTable) || null
  const selectedTargetTable = targetTables.find((table) => buildTableKey(table) === targetTable) || null

  function quoteIdentifier(name: string) {
    if (currentDbType === 'mysql') return `\`${name}\``
    return `"${name.replace(/"/g, '""')}"`
  }

  function buildTableIdentifier(table: TableInfo) {
    if (currentDbType === 'postgresql' || currentDbType === 'opengauss' || currentDbType === 'gaussdb') {
      return `${quoteIdentifier(table.schema || 'public')}.${quoteIdentifier(table.name)}`
    }
    return quoteIdentifier(table.name)
  }

  // 连接变化：重置并加载库（对等 watch immediate）
  useEffect(() => {
    setDatabases([])
    setSourceDatabase('')
    setTargetDatabase('')
    setSourceTable('')
    setTargetTable('')
    setSourceTables([])
    setTargetTables([])
    setComparisonResult(null)
    if (!connectionId) return
    void (async () => {
      try {
        const dbs = await metadataApi.getDatabases(connectionId)
        setDatabases(dbs)
        if (initialDatabase && dbs.some((db) => db.name === initialDatabase)) {
          setSourceDatabase(initialDatabase)
          setTargetDatabase(initialDatabase)
        } else if (dbs.length === 1) {
          setSourceDatabase(dbs[0].name)
          setTargetDatabase(dbs[0].name)
        }
      } catch (error: unknown) {
        message.error(t('tools.data_compare.load_db_fail', { error: String(error) }))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId])

  // 源/目标库变化：加载表（对等两个 watch）
  useEffect(() => {
    setSourceTable('')
    setSourceTables([])
    setComparisonResult(null)
    if (!sourceDatabase || !connectionId) return
    void (async () => {
      try {
        setSourceTables(await metadataApi.getTables(connectionId, sourceDatabase))
      } catch (error: unknown) {
        message.error(t('tools.data_compare.load_table_fail', { error: String(error) }))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceDatabase])

  useEffect(() => {
    setTargetTable('')
    setTargetTables([])
    setComparisonResult(null)
    if (!targetDatabase || !connectionId) return
    void (async () => {
      try {
        setTargetTables(await metadataApi.getTables(connectionId, targetDatabase))
      } catch (error: unknown) {
        message.error(t('tools.data_compare.load_table_fail', { error: String(error) }))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDatabase])

  // 换表清结果
  useEffect(() => {
    setComparisonResult(null)
  }, [sourceTable, targetTable])

  async function handleCompare() {
    if (!sourceDatabase || !targetDatabase || !selectedSourceTable || !selectedTargetTable) {
      message.warning(t('tools.data_compare.select_required'))
      return
    }

    setComparing(true)
    try {
      const structureDiff: StructureDetail[] = []
      let dataDiff = 0

      if (compareStructure) {
        const sourceStructure = await metadataApi.getTableStructure({
          connectionId: connectionId!,
          table: selectedSourceTable.name,
          schema: selectedSourceTable.schema || null,
          database: sourceDatabase,
        })
        const targetStructure = await metadataApi.getTableStructure({
          connectionId: connectionId!,
          table: selectedTargetTable.name,
          schema: selectedTargetTable.schema || null,
          database: targetDatabase,
        })

        if (sourceStructure.length !== targetStructure.length) {
          structureDiff.push({
            type: t('tools.data_compare.diff_column_count'),
            message: t('tools.data_compare.diff_column_count_msg', { source: sourceStructure.length, target: targetStructure.length }),
          })
        }

        for (const sourceCol of sourceStructure) {
          const targetCol = targetStructure.find((c: ColumnInfo) => c.name === sourceCol.name)
          if (!targetCol) {
            structureDiff.push({
              type: t('tools.data_compare.diff_missing_column'),
              message: t('tools.data_compare.diff_missing_column_msg', { column: sourceCol.name }),
            })
          } else if (sourceCol.data_type !== targetCol.data_type) {
            structureDiff.push({
              type: t('tools.data_compare.diff_type_mismatch'),
              message: t('tools.data_compare.diff_type_mismatch_msg', { column: sourceCol.name, source: sourceCol.data_type, target: targetCol.data_type }),
            })
          }
        }
      }

      if (compareData) {
        const sourceData = await queryApi.executeQuery(
          connectionId!,
          `SELECT COUNT(*) AS count FROM ${buildTableIdentifier(selectedSourceTable)}`,
          sourceDatabase,
        )
        const targetData = await queryApi.executeQuery(
          connectionId!,
          `SELECT COUNT(*) AS count FROM ${buildTableIdentifier(selectedTargetTable)}`,
          targetDatabase,
        )

        const sourceCount = (sourceData[0]?.rows?.[0] as Record<string, unknown>)?.count || 0
        const targetCount = (targetData[0]?.rows?.[0] as Record<string, unknown>)?.count || 0
        dataDiff = Math.abs(Number(sourceCount) - Number(targetCount))
      }

      setComparisonResult({
        structureDiff: structureDiff.length,
        dataDiff,
        missingRows: 0,
        extraRows: 0,
        structureDetails: structureDiff,
      })

      message.success(t('tools.data_compare.success'))
    } catch (error: unknown) {
      message.error(t('tools.data_compare.fail', { error: String(error) }))
    } finally {
      setComparing(false)
    }
  }

  function generateSyncScript() {
    message.info(t('tools.data_compare.sync_developing'))
  }

  const renderTableSelector = (
    title: string,
    database: string,
    onDatabaseChange: (value: string) => void,
    table: string,
    onTableChange: (value: string) => void,
    tables: TableInfo[],
  ) => (
    <Card title={title} size="small">
      <Form layout="vertical">
        <Form.Item label={t('tools.data_compare.database')}>
          <Select
            value={database || undefined}
            placeholder={t('tools.data_compare.database_placeholder')}
            onChange={(v) => onDatabaseChange(String(v))}
            options={databases.map((db) => ({ value: db.name, label: db.name }))}
          />
        </Form.Item>
        <Form.Item label={t('tools.data_compare.table')}>
          <Select
            value={table || undefined}
            placeholder={t('tools.data_compare.table_placeholder')}
            disabled={!database}
            onChange={(v) => onTableChange(String(v))}
            options={tables.map((item) => ({ value: buildTableKey(item), label: formatTableLabel(item) }))}
          />
        </Form.Item>
      </Form>
    </Card>
  )

  return (
    <div className={styles.dataCompare}>
      <div className={`section-header ${styles.compareHeader}`}>
        <h3>{t('tools.data_compare.title')}</h3>
        <p>{t('tools.data_compare.subtitle')}</p>
      </div>

      <div className={styles.compareConfig}>
        <Row gutter={16}>
          <Col span={12}>
            {renderTableSelector(t('tools.data_compare.source'), sourceDatabase, setSourceDatabase, sourceTable, setSourceTable, sourceTables)}
          </Col>
          <Col span={12}>
            {renderTableSelector(t('tools.data_compare.target'), targetDatabase, setTargetDatabase, targetTable, setTargetTable, targetTables)}
          </Col>
        </Row>

        <div className={styles.compareOptions}>
          <Space>
            <Button type="primary" onClick={() => void handleCompare()} loading={comparing}>
              <RetweetOutlined /> {t('tools.data_compare.start_compare')}
            </Button>
            <Checkbox checked={compareStructure} onChange={(e) => setCompareStructure(e.target.checked)}>
              {t('tools.data_compare.compare_structure')}
            </Checkbox>
            <Checkbox checked={compareData} onChange={(e) => setCompareData(e.target.checked)}>
              {t('tools.data_compare.compare_data')}
            </Checkbox>
          </Space>
        </div>
      </div>

      {comparisonResult && (
        <div className={styles.compareResult}>
          <Tabs
            items={[
              {
                key: 'summary',
                label: t('tools.data_compare.summary'),
                children: (
                  <Descriptions bordered size="small">
                    <Descriptions.Item label={t('tools.data_compare.structure_diff')}>
                      <Tag color={comparisonResult.structureDiff > 0 ? 'warning' : 'success'}>
                        {t('tools.data_compare.diff_count', { n: comparisonResult.structureDiff })}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label={t('tools.data_compare.data_diff')}>
                      <Tag color={comparisonResult.dataDiff > 0 ? 'warning' : 'success'}>
                        {t('tools.data_compare.diff_rows', { n: comparisonResult.dataDiff })}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label={t('tools.data_compare.missing_rows')}>
                      {comparisonResult.missingRows}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('tools.data_compare.extra_rows')}>
                      {comparisonResult.extraRows}
                    </Descriptions.Item>
                  </Descriptions>
                ),
              },
              {
                key: 'structure',
                label: t('tools.data_compare.structure_diff_tab'),
                children: (!comparisonResult.structureDetails || comparisonResult.structureDetails.length === 0) ? (
                  <Empty description={t('tools.data_compare.no_structure_diff')} />
                ) : (
                  <List
                    dataSource={comparisonResult.structureDetails}
                    size="small"
                    bordered
                    renderItem={(item) => (
                      <List.Item>
                        <Tag color="warning">{item.type}</Tag>
                        {item.message}
                      </List.Item>
                    )}
                  />
                ),
              },
              {
                key: 'data',
                label: t('tools.data_compare.data_diff_tab'),
                children: comparisonResult.dataDiff === 0 ? (
                  <Alert message={t('tools.data_compare.data_identical')} type="success" showIcon />
                ) : (
                  <div>
                    <p>{t('tools.data_compare.found_data_diff', { n: comparisonResult.dataDiff })}</p>
                    <Button type="primary" onClick={generateSyncScript}>
                      {t('tools.data_compare.generate_sync')}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}
    </div>
  )
}
