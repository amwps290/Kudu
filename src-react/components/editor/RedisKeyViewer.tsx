import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Empty, Input, List, Space, Spin, Table, Tag } from 'antd'
import { message, Modal } from '../../ui/antd'
import { redisApi } from '@/api'
import styles from './RedisKeyViewer.module.css'

/** Redis key 查看器（对等 Vue 版 RedisKeyViewer.vue：string/list/set/zset/hash 五类型视图） */

interface RedisKeyData {
  key_type: string
  value: unknown
  ttl: number
}

interface RedisKeyViewerProps {
  connectionId: string
  keyName: string
  /** 外部刷新令牌（对等 Vue 的组合 :key 强制重挂载） */
  refreshToken?: number
  onDeleted: () => void
  onUpdated: () => void
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    string: 'green',
    list: 'blue',
    set: 'orange',
    zset: 'purple',
    hash: 'cyan',
  }
  return colors[type] || 'default'
}

function formatHashData(value: unknown): Array<{ field: string; value: string }> {
  if (Array.isArray(value)) {
    const result: Array<{ field: string; value: string }> = []
    for (let i = 0; i < value.length; i += 2) {
      result.push({ field: value[i], value: value[i + 1] })
    }
    return result
  }
  return []
}

function formatZsetData(value: unknown): Array<{ member: string; score: string }> {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => {
      if (Array.isArray(item) && item.length === 2) {
        return { member: item[0], score: item[1] }
      }
      return item as { member: string; score: string }
    })
  }
  return []
}

export default function RedisKeyViewer({ connectionId, keyName, refreshToken = 0, onDeleted, onUpdated }: RedisKeyViewerProps) {
  const { t } = useTranslation()

  const [loading, setLoading] = useState(false)
  const [keyData, setKeyData] = useState<RedisKeyData | null>(null)
  const [editing, setEditing] = useState(false)
  const [editedValue, setEditedValue] = useState('')

  async function loadKeyValue() {
    if (!keyName) return
    setLoading(true)
    try {
      const result = await redisApi.getKeyValue(connectionId, keyName)
      setKeyData(result as RedisKeyData)
      if ((result as RedisKeyData).key_type === 'string') {
        setEditedValue((result as RedisKeyData).value as string)
      }
    } catch (error: unknown) {
      message.error(t('redis.key_viewer.get_fail', { error: String(error) }))
    } finally {
      setLoading(false)
    }
  }

  // keyName/refreshToken 变化时重载（对等 Vue watch immediate + 组合 :key 重挂载）
  useEffect(() => {
    if (keyName) {
      setEditing(false)
      void loadKeyValue()
    } else {
      setKeyData(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyName, refreshToken, connectionId])

  async function handleSave() {
    if (!keyData) return
    try {
      await redisApi.setKeyValue(
        connectionId,
        keyName,
        editedValue,
        keyData.ttl > 0 ? keyData.ttl : undefined,
      )
      message.success(t('redis.key_viewer.save_success'))
      setEditing(false)
      onUpdated()
      void loadKeyValue()
    } catch (error: unknown) {
      message.error(t('redis.key_viewer.save_fail', { error: String(error) }))
    }
  }

  function cancelEdit() {
    setEditing(false)
    setEditedValue((keyData?.value as string) || '')
  }

  function handleDelete() {
    Modal.confirm({
      title: t('redis.key_viewer.delete_confirm_title'),
      content: t('redis.key_viewer.delete_confirm_content', { key: keyName }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      async onOk() {
        try {
          await redisApi.deleteKey(connectionId, keyName)
          message.success(t('redis.key_viewer.delete_success'))
          onDeleted()
        } catch (error: unknown) {
          message.error(t('redis.key_viewer.delete_fail', { error: String(error) }))
        }
      },
    })
  }

  const hashColumns = [
    { title: t('redis.key_viewer.field'), dataIndex: 'field', key: 'field' },
    { title: t('redis.key_viewer.value'), dataIndex: 'value', key: 'value' },
  ]

  const zsetColumns = [
    { title: t('redis.key_viewer.member'), dataIndex: 'member', key: 'member' },
    { title: t('redis.key_viewer.score'), dataIndex: 'score', key: 'score' },
  ]

  return (
    <div className={styles.redisKeyViewer}>
      <Spin spinning={loading}>
        {keyData ? (
          <Card
            title={t('redis.key_viewer.key_label', { key: keyName })}
            size="small"
            extra={(
              <Space>
                <Tag color={getTypeColor(keyData.key_type)}>{keyData.key_type}</Tag>
                {keyData.ttl > 0 ? (
                  <Tag color="orange">{t('redis.key_viewer.ttl_seconds', { ttl: keyData.ttl })}</Tag>
                ) : keyData.ttl === -1 ? (
                  <Tag color="blue">{t('redis.key_viewer.never_expire')}</Tag>
                ) : null}
                <Button size="small" danger onClick={handleDelete}>
                  {t('common.delete')}
                </Button>
              </Space>
            )}
          >
            {keyData.key_type === 'string' ? (
              <div>
                <Input.TextArea
                  value={editedValue}
                  onChange={(e) => setEditedValue(e.target.value)}
                  rows={10}
                  disabled={!editing}
                />
                <Space className={styles.keyEditorActions}>
                  {!editing ? (
                    <Button onClick={() => setEditing(true)}>{t('common.edit')}</Button>
                  ) : (
                    <>
                      <Button type="primary" onClick={() => void handleSave()}>{t('common.save')}</Button>
                      <Button onClick={cancelEdit}>{t('common.cancel')}</Button>
                    </>
                  )}
                </Space>
              </div>
            ) : keyData.key_type === 'list' ? (
              <List
                dataSource={keyData.value as string[]}
                bordered
                size="small"
                renderItem={(item, index) => (
                  <List.Item><strong>[{index}]</strong> {item}</List.Item>
                )}
              />
            ) : keyData.key_type === 'set' ? (
              <List
                dataSource={keyData.value as string[]}
                bordered
                size="small"
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            ) : keyData.key_type === 'zset' ? (
              <Table
                columns={zsetColumns}
                dataSource={formatZsetData(keyData.value)}
                pagination={false}
                size="small"
                bordered
                rowKey="member"
              />
            ) : keyData.key_type === 'hash' ? (
              <Table
                columns={hashColumns}
                dataSource={formatHashData(keyData.value)}
                pagination={false}
                size="small"
                bordered
                rowKey="field"
              />
            ) : (
              <pre>{JSON.stringify(keyData.value, null, 2)}</pre>
            )}
          </Card>
        ) : (
          <Empty description={t('redis.key_viewer.select_key')} />
        )}
      </Spin>
    </div>
  )
}
