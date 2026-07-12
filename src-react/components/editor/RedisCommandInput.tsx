import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { registerRedisCompletionProvider } from '@/services/redisAutocomplete'
import { useMonacoEditor } from '../../hooks/useMonacoEditor'
import type { MonacoModule } from '@/utils/monacoLoader'
import styles from './RedisCommandInput.module.css'

/** Redis 命令输入（对等 Vue 版 RedisCommandInput.vue：Monaco shell + 107 命令补全 + Ctrl+Enter 执行） */

export interface RedisCommandInputHandle {
  getValue(): string
  setValue(value: string): void
}

interface RedisCommandInputProps {
  initialValue?: string
  onExecute: () => void
  onCursorChange: (line: number, column: number) => void
}

const RedisCommandInput = forwardRef<RedisCommandInputHandle, RedisCommandInputProps>(
  function RedisCommandInput({ initialValue, onExecute, onCursorChange }, ref) {
    const { t } = useTranslation()
    const containerRef = useRef<HTMLDivElement>(null)

    const latestRef = useRef({ onExecute, onCursorChange })
    latestRef.current = { onExecute, onCursorChange }

    const handleReady = useCallback((editor: any, monaco: MonacoModule) => {
      void registerRedisCompletionProvider()
      editor.onDidChangeCursorPosition((e: any) => {
        latestRef.current.onCursorChange(e.position.lineNumber, e.position.column)
      })
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        latestRef.current.onExecute()
      })
    }, [])

    const { editorRef } = useMonacoEditor(containerRef, {
      value: initialValue || t('redis.command_input_placeholder'),
      language: 'shell',
      extraOptions: {
        renderLineHighlight: 'all',
        quickSuggestions: { other: true, comments: false, strings: false },
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnCommitCharacter: true,
        acceptSuggestionOnEnter: 'on',
        tabCompletion: 'on',
      },
      onReady: handleReady,
    })

    useImperativeHandle(ref, () => ({
      getValue: () => editorRef.current?.getValue()?.trim() || '',
      setValue: (value: string) => { editorRef.current?.setValue(value) },
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [])

    return (
      <div className={styles.commandInputSection}>
        <div ref={containerRef} className={styles.editorWrapper} />
      </div>
    )
  },
)

export default RedisCommandInput
