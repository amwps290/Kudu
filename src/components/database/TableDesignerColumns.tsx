import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Input, InputNumber, Select, Space, Table } from 'antd'
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { DesignerColumn } from './designerTypes'

/**
 * 列定义编辑表（对等 Vue 版 TableDesignerColumns.vue）。
 * 范式转换：Vue 子组件直接突变 record（record.name = xx + record._modified = true）；
 * React 改为受控——所有编辑经 onPatch(index, patch) 上抛，由父组件不可变更新。
 */

const DATA_TYPES = [
  'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
  'VARCHAR', 'CHAR', 'TEXT', 'LONGTEXT', 'MEDIUMTEXT',
  'DECIMAL', 'FLOAT', 'DOUBLE',
  'DATE', 'DATETIME', 'TIMESTAMP', 'TIME',
  'BOOLEAN', 'BOOL',
  'JSON',
  'BLOB', 'LONGBLOB',
]

interface TableDesignerColumnsProps {
  columns: DesignerColumn[]
  loading: boolean
  readOnly?: boolean
  onPatch: (index: number, patch: Partial<DesignerColumn>) => void
  onRemove: (index: number) => void
  onMove: (index: number, direction: number) => void
}

export default function TableDesignerColumns({
  columns, loading, readOnly, onPatch, onRemove, onMove,
}: TableDesignerColumnsProps) {
  const { t } = useTranslation()

  const patchModified = (index: number, patch: Partial<DesignerColumn>) => {
    onPatch(index, { ...patch, _modified: true })
  }

  const editorColumns: ColumnsType<DesignerColumn> = [
    {
      title: t('designer.column_name'), dataIndex: 'name', width: 150,
      render: (_, record, index) => readOnly ? record.name : (
        <Input
          value={record.name}
          size="small"
          placeholder={t('designer.column_name')}
          onChange={(e) => patchModified(index, { name: e.target.value })}
        />
      ),
    },
    {
      title: t('designer.data_type'), dataIndex: 'data_type', width: 120,
      render: (_, record, index) => readOnly ? record.data_type : (
        <Select
          value={record.data_type}
          size="small"
          style={{ width: '100%' }}
          options={DATA_TYPES.map((type) => ({ value: type, label: type }))}
          onChange={(v) => patchModified(index, { data_type: v })}
        />
      ),
    },
    {
      title: t('designer.length'), dataIndex: 'length', width: 80,
      render: (_, record, index) => readOnly ? (record.length ?? '') : (
        <InputNumber
          value={record.length}
          size="small"
          min={1}
          style={{ width: '100%' }}
          onChange={(v) => patchModified(index, { length: v ?? undefined })}
        />
      ),
    },
    {
      title: t('designer.nullable'), dataIndex: 'nullable', width: 60,
      render: (_, record, index) => (
        <Checkbox
          checked={record.nullable}
          disabled={readOnly}
          onChange={(e) => patchModified(index, { nullable: e.target.checked })}
        />
      ),
    },
    {
      title: t('designer.pk'), dataIndex: 'is_primary_key', width: 60,
      render: (_, record, index) => (
        <Checkbox
          checked={record.is_primary_key}
          disabled={readOnly}
          onChange={(e) => {
            // 主键强制非空（照抄 handlePrimaryKeyChange）
            const checked = e.target.checked
            patchModified(index, checked ? { is_primary_key: true, nullable: false } : { is_primary_key: false })
          }}
        />
      ),
    },
    {
      title: t('designer.auto_increment'), dataIndex: 'is_auto_increment', width: 60,
      render: (_, record, index) => (
        <Checkbox
          checked={record.is_auto_increment}
          disabled={readOnly}
          onChange={(e) => patchModified(index, { is_auto_increment: e.target.checked })}
        />
      ),
    },
    {
      title: t('designer.default_value'), dataIndex: 'default_value', width: 120,
      render: (_, record, index) => readOnly ? (record.default_value ?? '') : (
        <Input
          value={record.default_value ?? ''}
          size="small"
          placeholder={t('designer.default_value_placeholder')}
          onChange={(e) => patchModified(index, { default_value: e.target.value })}
        />
      ),
    },
    {
      title: t('designer.comment'), dataIndex: 'comment', width: 200,
      render: (_, record, index) => readOnly ? (record.comment ?? '') : (
        <Input
          value={record.comment ?? ''}
          size="small"
          placeholder={t('designer.comment')}
          onChange={(e) => patchModified(index, { comment: e.target.value })}
        />
      ),
    },
    ...(!readOnly ? [{
      title: t('common.view'), dataIndex: 'operation', width: 120, fixed: 'right' as const,
      render: (_: unknown, __: DesignerColumn, index: number) => (
        <Space>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onRemove(index)} />
          <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => onMove(index, -1)} />
          <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={index === columns.length - 1} onClick={() => onMove(index, 1)} />
        </Space>
      ),
    }] : []),
  ]

  return (
    <Table
      columns={editorColumns}
      dataSource={columns}
      loading={loading}
      pagination={false}
      scroll={{ x: 'max-content', y: 'calc(100vh - 250px)' }}
      size="small"
      bordered
      rowKey={(record) => `${record._isNew ? 'new' : 'old'}:${record._originalName || record._createdOrder || record.name}`}
    />
  )
}
