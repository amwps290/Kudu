import { useTranslation } from 'react-i18next'
import { Button, Space, Table } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { DesignerForeignKey } from './designerTypes'
import styles from './TableDesignerSection.module.css'

/** 外键列表（对等 Vue 版 TableDesignerForeignKeys.vue） */

interface TableDesignerForeignKeysProps {
  foreignKeys: DesignerForeignKey[]
  loading: boolean
  readOnly?: boolean
  onAdd: () => void
  onRemove: (record: DesignerForeignKey) => void
}

export default function TableDesignerForeignKeys({ foreignKeys, loading, readOnly, onAdd, onRemove }: TableDesignerForeignKeysProps) {
  const { t } = useTranslation()

  const displayColumns: ColumnsType<DesignerForeignKey> = [
    { title: t('designer.fk_name'), dataIndex: 'name', key: 'name' },
    { title: t('designer.fk_column'), dataIndex: 'column_name', key: 'column_name' },
    { title: t('designer.ref_table'), dataIndex: 'referenced_table_name', key: 'referenced_table_name' },
    { title: t('designer.ref_column'), dataIndex: 'referenced_column_name', key: 'referenced_column_name' },
    ...(!readOnly ? [{
      title: t('common.delete'), dataIndex: 'operation', width: 100,
      render: (_: unknown, record: DesignerForeignKey) => (
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
            {t('designer.add_fk')}
          </Button>
        </Space>
      )}
      <Table
        columns={displayColumns}
        dataSource={foreignKeys}
        loading={loading}
        pagination={false}
        size="small"
        bordered
        rowKey="name"
      />
    </div>
  )
}
