import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from 'antd'
import { metadataApi } from '@/api'
import { getErrorMessage } from '@/utils/errorHandler'
import type { ColumnInfo, ForeignKeyInfo } from '@/types/database'
import styles from './ErDiagram.module.css'

/**
 * ER 图（对等 Vue 版 ErDiagram.vue：自绘 SVG + CSS transform，无第三方图库）。
 * 数学逻辑（贝塞尔连线/滚轮缩放锚点/适应视图/网格布局）逐行平移；
 * 节点拖拽从 Vue 的就地突变改为不可变 setNodes。
 */

const NODE_WIDTH = 280
const NODE_HEADER_HEIGHT = 54
const NODE_ROW_HEIGHT = 24
const GRID_GAP_X = 84
const GRID_GAP_Y = 48

interface DiagramNode {
  key: string
  name: string
  schema?: string
  x: number
  y: number
  columns: ColumnInfo[]
}

interface DiagramEdge {
  key: string
  sourceKey: string
  targetKey: string
  sourceTable: string
  sourceSchema?: string
  sourceColumn: string
  targetTable: string
  targetSchema?: string
  targetColumn: string
}

interface ErDiagramProps {
  connectionId: string | null
  database: string | null
  table: string | null
  schema: string | null
}

function nodeHeight(node: DiagramNode) {
  return NODE_HEADER_HEIGHT + Math.max(node.columns.length, 1) * NODE_ROW_HEIGHT + 14
}

function buildNodeKey(name: string, schema?: string | null) {
  return `${schema || ''}.${name}`
}

function resolveReferencedKey(
  referencedTableName: string,
  sourceSchema: string | undefined,
  tableKeys: Set<string>,
  schemaByName: Map<string, string[]>,
) {
  const sameSchemaKey = buildNodeKey(referencedTableName, sourceSchema)
  if (tableKeys.has(sameSchemaKey)) return sameSchemaKey
  const schemas = schemaByName.get(referencedTableName) || []
  if (schemas.length > 0) return buildNodeKey(referencedTableName, schemas[0])
  return buildNodeKey(referencedTableName)
}

function buildGridPosition(index: number) {
  const columns = 4
  const col = index % columns
  const row = Math.floor(index / columns)
  return {
    x: 40 + col * (NODE_WIDTH + GRID_GAP_X),
    y: 40 + row * (320 + GRID_GAP_Y),
  }
}

export default function ErDiagram({ connectionId, database, table, schema }: ErDiagramProps) {
  const { t } = useTranslation()

  const viewportRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [nodes, setNodes] = useState<DiagramNode[]>([])
  const [edges, setEdges] = useState<DiagramEdge[]>([])
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 48, y: 48 })

  const nodesRef = useRef<DiagramNode[]>([])
  nodesRef.current = nodes
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const offsetRef = useRef(offset)
  offsetRef.current = offset

  const focusLabel = (() => {
    const location = [database || '-', schema || ''].filter(Boolean).join(' / ')
    return [location, table || '-'].filter(Boolean).join(' / ')
  })()

  const foreignKeyColumnMap = (() => {
    const set = new Set<string>()
    for (const edge of edges) {
      set.add(`${edge.sourceKey}.${edge.sourceColumn}`)
    }
    return set
  })()

  const canvasSize = (() => {
    const maxRight = Math.max(...nodes.map((node) => node.x + NODE_WIDTH), 1200)
    const maxBottom = Math.max(...nodes.map((node) => node.y + nodeHeight(node)), 900)
    return { width: maxRight + 200, height: maxBottom + 200 }
  })()

  function fitToViewportWith(nextNodes: DiagramNode[]) {
    const viewport = viewportRef.current
    if (!viewport || nextNodes.length === 0) return
    const minX = Math.min(...nextNodes.map((node) => node.x))
    const minY = Math.min(...nextNodes.map((node) => node.y))
    const maxX = Math.max(...nextNodes.map((node) => node.x + NODE_WIDTH))
    const maxY = Math.max(...nextNodes.map((node) => node.y + nodeHeight(node)))
    const contentWidth = maxX - minX + 80
    const contentHeight = maxY - minY + 80
    const nextScale = Math.max(0.45, Math.min(1, Math.min(viewport.clientWidth / contentWidth, viewport.clientHeight / contentHeight)))
    setScale(nextScale)
    setOffset({
      x: (viewport.clientWidth - contentWidth * nextScale) / 2 - minX * nextScale,
      y: (viewport.clientHeight - contentHeight * nextScale) / 2 - minY * nextScale,
    })
  }

  async function loadDiagram() {
    if (!connectionId || !table) return
    setLoading(true)
    setErrorText('')
    try {
      const tables = await metadataApi.getTables(connectionId, database)
      const tableNodes = tables.filter((item) => {
        const tableType = String(item.table_type || '').toUpperCase()
        return tableType.includes('TABLE') && !tableType.includes('VIEW')
      })
      const allTableKeys = new Set(tableNodes.map((item) => buildNodeKey(item.name, item.schema)))
      const schemaByName = new Map<string, string[]>()
      for (const item of tableNodes) {
        const current = schemaByName.get(item.name) || []
        current.push(item.schema || '')
        schemaByName.set(item.name, current)
      }

      const focusKey = buildNodeKey(table, schema)
      if (!allTableKeys.has(focusKey)) {
        setNodes([])
        setEdges([])
        return
      }

      const fkPayloads = await Promise.all(tableNodes.map(async (item) => ({
        table: item,
        foreignKeys: await metadataApi.getTableForeignKeys({
          connectionId,
          table: item.name,
          schema: item.schema,
        }),
      })))

      const relatedKeys = new Set<string>([focusKey])
      for (const payload of fkPayloads) {
        const sourceKey = buildNodeKey(payload.table.name, payload.table.schema)
        for (const fk of payload.foreignKeys) {
          const targetKey = resolveReferencedKey(fk.referenced_table_name, payload.table.schema, allTableKeys, schemaByName)
          if (sourceKey === focusKey) relatedKeys.add(targetKey)
          if (targetKey === focusKey) relatedKeys.add(sourceKey)
        }
      }

      const payloads = await Promise.all(fkPayloads
        .filter(({ table: item }) => relatedKeys.has(buildNodeKey(item.name, item.schema)))
        .map(async ({ table: item, foreignKeys }, index) => {
          const columns = await metadataApi.getTableStructure({
            connectionId,
            table: item.name,
            database,
            schema: item.schema,
          })
          return {
            node: {
              key: buildNodeKey(item.name, item.schema),
              name: item.name,
              schema: item.schema,
              ...buildGridPosition(index),
              columns,
            } satisfies DiagramNode,
            foreignKeys,
          }
        }))

      const nextNodes = payloads.map((item) => item.node)
      setNodes(nextNodes)
      const nodeKeySet = new Set(nextNodes.map((node) => node.key))
      setEdges(payloads.flatMap((item) => item.foreignKeys.map((fk: ForeignKeyInfo) => {
        const sourceKey = item.node.key
        const targetKey = resolveReferencedKey(fk.referenced_table_name, item.node.schema, nodeKeySet, schemaByName)
        return {
          key: `${item.node.key}-${fk.name}-${fk.column_name}`,
          sourceKey,
          targetKey,
          sourceTable: item.node.name,
          sourceSchema: item.node.schema,
          sourceColumn: fk.column_name,
          targetTable: fk.referenced_table_name,
          targetSchema: targetKey.split('.').slice(0, -1).join('.') || undefined,
          targetColumn: fk.referenced_column_name,
        } satisfies DiagramEdge
      })).filter((edge) => nodeKeySet.has(edge.targetKey)))

      fitToViewportWith(nextNodes)
    } catch (error: unknown) {
      setErrorText(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDiagram()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, database, schema, table])

  function findNode(key: string) {
    return nodes.find((node) => node.key === key)
  }

  function buildEdgePath(edge: DiagramEdge) {
    const source = findNode(edge.sourceKey)
    const target = findNode(edge.targetKey)
    if (!source || !target) return ''

    const startX = source.x + NODE_WIDTH
    const startY = source.y + NODE_HEADER_HEIGHT + Math.max(source.columns.findIndex((column) => column.name === edge.sourceColumn), 0) * NODE_ROW_HEIGHT + 22
    const endX = target.x
    const endY = target.y + NODE_HEADER_HEIGHT + Math.max(target.columns.findIndex((column) => column.name === edge.targetColumn), 0) * NODE_ROW_HEIGHT + 22
    const midX = startX + (endX - startX) / 2

    return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`
  }

  function edgeLabelPosition(edge: DiagramEdge) {
    const source = findNode(edge.sourceKey)
    const target = findNode(edge.targetKey)
    if (!source || !target) return { x: 0, y: 0 }
    return {
      x: source.x + NODE_WIDTH + (target.x - (source.x + NODE_WIDTH)) / 2,
      y: source.y + 16,
    }
  }

  function handleWheel(event: React.WheelEvent) {
    event.preventDefault()
    const delta = event.deltaY < 0 ? 0.12 : -0.12
    const currentScale = scaleRef.current
    const nextScale = Math.max(0.45, Math.min(1.8, currentScale + delta))
    if (nextScale === currentScale) return

    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const pointX = event.clientX - rect.left
    const pointY = event.clientY - rect.top
    const worldX = (pointX - offsetRef.current.x) / currentScale
    const worldY = (pointY - offsetRef.current.y) / currentScale

    setScale(nextScale)
    setOffset({
      x: pointX - worldX * nextScale,
      y: pointY - worldY * nextScale,
    })
  }

  function startPan(event: React.PointerEvent) {
    if ((event.target as HTMLElement)?.closest(`.${styles.erNode}`)) return
    event.preventDefault()
    const start = { x: event.clientX, y: event.clientY }
    const initial = { ...offsetRef.current }
    const move = (moveEvent: PointerEvent) => {
      setOffset({
        x: initial.x + (moveEvent.clientX - start.x),
        y: initial.y + (moveEvent.clientY - start.y),
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function startDragNode(event: React.PointerEvent, nodeKey: string) {
    event.preventDefault()
    event.stopPropagation()
    const node = nodesRef.current.find((item) => item.key === nodeKey)
    if (!node) return
    const start = { x: event.clientX, y: event.clientY }
    const initial = { x: node.x, y: node.y }
    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - start.x) / scaleRef.current
      const dy = (moveEvent.clientY - start.y) / scaleRef.current
      setNodes((prev) => prev.map((item) => (
        item.key === nodeKey ? { ...item, x: initial.x + dx, y: initial.y + dy } : item
      )))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className={styles.erShell}>
      <div className={styles.erToolbar}>
        <div className={styles.erToolbarMeta}>
          <div className={styles.erTitle}>{t('tools.er_diagram.title')}</div>
          <div className={styles.erSubtitle}>
            {focusLabel} · {t('tools.er_diagram.summary', { tables: nodes.length, relations: edges.length })}
          </div>
        </div>
        <div className={styles.erToolbarActions}>
          <Button size="small" onClick={() => fitToViewportWith(nodesRef.current)}>{t('tools.er_diagram.fit_view')}</Button>
          <Button size="small" onClick={() => void loadDiagram()} loading={loading}>{t('common.refresh')}</Button>
        </div>
      </div>

      <div ref={viewportRef} className={styles.erViewport} onPointerDown={startPan} onWheel={handleWheel}>
        {loading ? (
          <div className={styles.erState}>{t('common.loading')}</div>
        ) : errorText ? (
          <div className={`${styles.erState} ${styles.erStateError}`}>{errorText}</div>
        ) : nodes.length === 0 ? (
          <div className={styles.erState}>{t('tools.er_diagram.empty')}</div>
        ) : (
          <div
            className={styles.erCanvas}
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
          >
            <svg className={styles.erLinks} width={canvasSize.width} height={canvasSize.height}>
              {edges.map((edge) => (
                <g key={edge.key}>
                  <path d={buildEdgePath(edge)} className={styles.erLinkPath} />
                  <text x={edgeLabelPosition(edge).x} y={edgeLabelPosition(edge).y} className={styles.erLinkLabel}>
                    {edge.sourceColumn} → {edge.targetColumn}
                  </text>
                </g>
              ))}
            </svg>

            {nodes.map((node) => (
              <div
                key={node.key}
                className={styles.erNode}
                style={{ width: `${NODE_WIDTH}px`, left: `${node.x}px`, top: `${node.y}px` }}
              >
                <div className={styles.erNodeHeader} onPointerDown={(e) => startDragNode(e, node.key)}>
                  <div className={styles.erNodeTitle}>{node.name}</div>
                  <div className={styles.erNodeSchema}>{node.schema || '-'}</div>
                </div>
                <div className={styles.erNodeBody}>
                  {node.columns.map((column) => (
                    <div
                      key={`${node.key}-${column.name}`}
                      className={[
                        styles.erColumn,
                        column.is_primary_key ? styles.erColumnPk : '',
                        foreignKeyColumnMap.has(`${node.key}.${column.name}`) ? styles.erColumnFk : '',
                      ].join(' ')}
                    >
                      <span className={styles.erColumnName}>{column.name}</span>
                      <span className={styles.erColumnType}>{column.data_type}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
