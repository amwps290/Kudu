import { useState } from 'react'
import type { DataTab } from '../../hooks/useTabManager'
import styles from './TabContentPlaceholder.module.css'

/**
 * Slice 8 的 tab 内容占位组件。
 * QueryTabPlaceholder 持有本地 state（textarea），专门用于验证
 * 「切换 tab 不卸载、内容与滚动状态保留」的常驻挂载策略（D9）；
 * Slice 10 起被真实 SqlEditor 替换。
 */

export function QueryTabPlaceholder({
  tab,
  onContentChange,
}: {
  tab: DataTab
  onContentChange: (key: string, val: string) => void
}) {
  const [value, setValue] = useState(tab.content || '')

  return (
    <div className={styles.placeholder}>
      <div className={styles.hint}>
        SQL 编辑器（Monaco）将在 Slice 10 接入 —— 此文本框用于验证 tab 保活与 dirty 标记
      </div>
      <textarea
        className={styles.textarea}
        value={value}
        placeholder="在此输入内容，切换 tab 后应保留；输入会触发标题上的未保存圆点"
        onChange={(e) => {
          setValue(e.target.value)
          onContentChange(tab.key, e.target.value)
        }}
      />
    </div>
  )
}

export function GenericTabPlaceholder({ label }: { label: string }) {
  return (
    <div className={styles.placeholder}>
      <div className={styles.hint}>{label}</div>
    </div>
  )
}
