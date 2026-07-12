import { forwardRef, useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Empty, Space, Tabs, Tag, Timeline } from 'antd'
import styles from './RedisResultPanel.module.css'

/**
 * Redis 结果/消息面板（对等 Vue 版 RedisResultPanel.vue）。
 * Vue 版字符串结果走 v-html（先转义再换行替换）；React 直接文本渲染（自带转义），
 * 仅做字面 \r\n → 换行的替换——安全分段渲染（计划 Slice 19 要点）。
 */

export interface RedisMessage {
  type: 'success' | 'error' | 'info'
  text: string
  time: string
}

export interface RedisCommandResult {
  success: boolean
  result: unknown
  error: string | null
  execution_time_ms: number
}

export interface RedisResultPanelHandle {
  setActiveKey(key: string): void
}

interface RedisResultPanelProps {
  results: RedisCommandResult[]
  messages: RedisMessage[]
}

function formatResultText(result: unknown): string {
  if (result === null || result === undefined) return 'null'
  if (typeof result === 'string') {
    return result
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
  }
  return JSON.stringify(result, null, 2)
}

const RedisResultPanel = forwardRef<RedisResultPanelHandle, RedisResultPanelProps>(
  function RedisResultPanel({ results, messages }, ref) {
    const { t } = useTranslation()
    const [activeKey, setActiveKey] = useState('result')

    useImperativeHandle(ref, () => ({ setActiveKey }), [])

    const lastResult = results.length > 0 ? results[results.length - 1] : null

    const items = [
      {
        key: 'result',
        label: t('editor.result'),
        children: (
          <div className={styles.resultContent}>
            {results.length > 0 && (
              <div className={styles.resultInfo}>
                <Space>
                  <Tag color="success">{t('common.success')}</Tag>
                  <Tag color="processing">{results[results.length - 1]?.execution_time_ms || 0} ms</Tag>
                </Space>
              </div>
            )}
            {lastResult ? (
              <div className={`code-preview-panel ${styles.resultDisplay}`}>
                {lastResult.error ? (
                  <Alert type="error" message={lastResult.error} showIcon />
                ) : (
                  <div className={styles.resultContentWrapper}>
                    {typeof lastResult.result === 'string' ? (
                      <pre className={styles.resultText}>{formatResultText(lastResult.result)}</pre>
                    ) : (
                      <pre className={styles.resultJson}>{formatResultText(lastResult.result)}</pre>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <Empty description={t('editor.no_result')} />
            )}
          </div>
        ),
      },
      {
        key: 'messages',
        label: t('editor.messages'),
        children: (
          <div className={styles.messagesContent}>
            <Timeline
              items={messages.map((msg) => ({
                color: msg.type === 'success' ? 'green' : msg.type === 'error' ? 'red' : 'blue',
                children: (
                  <>
                    <span className={styles.messageTime}>{msg.time}</span>
                    <span className={styles.messageText}>{msg.text}</span>
                  </>
                ),
              }))}
            />
          </div>
        ),
      },
    ]

    return (
      <div className={styles.resultTabs}>
        <Tabs className={styles.resultTabsNav} activeKey={activeKey} onChange={setActiveKey} items={items} />
      </div>
    )
  },
)

export default RedisResultPanel
