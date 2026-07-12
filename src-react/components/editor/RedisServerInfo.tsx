import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Descriptions, Divider, Modal, Spin } from 'antd'
import { message } from '../../ui/antd'
import { redisApi } from '@/api'
import styles from './RedisServerInfo.module.css'

/** Redis 服务器信息弹窗（对等 Vue 版 RedisServerInfo.vue） */

interface RedisServerInfoProps {
  open: boolean
  connectionId: string | null
  onClose: () => void
}

export default function RedisServerInfo({ open, connectionId, onClose }: RedisServerInfoProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [info, setInfo] = useState<Record<string, any>>({})

  useEffect(() => {
    if (!open || !connectionId) return
    setLoading(true)
    void (async () => {
      try {
        setInfo(await redisApi.getInfo(connectionId))
      } catch (error: unknown) {
        message.error(t('redis.info.fetch_fail', { error: String(error) }))
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connectionId])

  const items = [
    { key: 'version', label: t('redis.info.version'), value: info.redis_version },
    { key: 'mode', label: t('redis.info.mode'), value: info.redis_mode },
    { key: 'used_memory', label: t('redis.info.used_memory'), value: info.used_memory_human },
    { key: 'peak_memory', label: t('redis.info.peak_memory'), value: info.used_memory_peak_human },
    { key: 'connected_clients', label: t('redis.info.connected_clients'), value: info.connected_clients },
    { key: 'uptime_days', label: t('redis.info.uptime_days'), value: info.uptime_in_days },
    { key: 'total_commands', label: t('redis.info.total_commands'), value: info.total_commands_processed },
    { key: 'total_keys', label: t('redis.info.total_keys'), value: info.db0 },
  ].filter((item) => item.value)

  return (
    <Modal open={open} title={t('redis.server_info_title')} width={900} footer={null} onCancel={onClose}>
      <Spin spinning={loading}>
        <Descriptions bordered size="small" column={2}>
          {items.map((item) => (
            <Descriptions.Item key={item.key} label={item.label}>{item.value}</Descriptions.Item>
          ))}
        </Descriptions>

        <Divider orientation="left">{t('redis.info.all_info')}</Divider>
        <pre className={`code-block-compact ${styles.serverInfoDetail}`}>{JSON.stringify(info, null, 2)}</pre>
      </Spin>
    </Modal>
  )
}
