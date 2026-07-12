import { useEffect, useRef } from 'react'
import { Modal } from 'antd'
import { useMonacoEditor } from '../../hooks/useMonacoEditor'
import styles from './DdlPreviewModal.module.css'

/**
 * DDL 预览弹窗（对等 Vue 版 DatabaseTree 内的 showDdlModal + 只读 Monaco 实例）。
 * Modal 内容首次打开时挂载 Monaco（antd Modal 默认惰性渲染），之后随 ddl 更新 setValue。
 */

interface DdlPreviewModalProps {
  open: boolean
  title: string
  ddl: string
  onClose: () => void
}

export default function DdlPreviewModal({ open, title, ddl, onClose }: DdlPreviewModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { ready, setValue } = useMonacoEditor(containerRef, {
    language: 'sql',
    readOnly: true,
  })

  useEffect(() => {
    if (ready) setValue(ddl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ddl])

  return (
    <Modal open={open} title={title} width="800px" footer={null} onCancel={onClose}>
      <div ref={containerRef} className={styles.ddlPreviewEditor} />
    </Modal>
  )
}
