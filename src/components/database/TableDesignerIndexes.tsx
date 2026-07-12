import { useTranslation } from 'react-i18next'
import { Button, Space, Table } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { DesignerIndex } from './designerTypes'
import styles from './TableDesignerSection.module.css'

/** 索引列表（对等 Vue 版 TableDesignerIndexes.vue） */

interface TableDesignerIndexesProps {
  indexes: DesignerIndex[]
  loading: boolean
  readOnly?: boolean
  onAdd: () => void
  onRemove: (record: DesignerIndex) => void
}

export default function TableDesignerIndexes({ indexes, loading, readOnly, onAdd, onRemove }: TableDesignerIndexesProps) {
  const { t } = useTranslation()

  const displayColumns: ColumnsType<DesignerIndex> = [
    { title: t('designer.index_name'), dataIndex: 'name', key: 'name' },
    {
      title: t('designer.index_columns'), dataIndex: 'columns', key: 'columns',
      render: (text) => Array.isArray(text) ? text.join(', ') : text,
    },
    { title: t('designer.index_type'), dataIndex: 'index_type', key: 'index_type' },
    {
      title: t('designer.unique'), dataIndex: 'is_unique', key: 'is_unique',
      render: (text) => text ? t('common.ok') : '-',
    },
    ...(!readOnly ? [{
      title: t('common.delete'), dataIndex: 'operation', width: 100,
      render: (_: unknown, record: DesignerIndex) => (
        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onRemove(record)}>
          {t('common.delete')}
        </Button>
      ),
    }] : []),
  ]

  return (
    <div className={styles.designerSection}>
      {!readOnly && (
        <Space className={styles.designerActions}>
          <Button icon={<PlusOutlined />} onClick={onAdd} type="primary">
            {t('designer.add_index')}
          </Button>
        </Space>
      )}
      <Table
        columns={displayColumns}
        dataSource={indexes}
        loading={loading}
        pagination={false}
        size="small"
        bordered
        rowKey="name"
      />
    </div>
  )
}
