import { useEffect, useRef, useState, type RefObject } from 'react'
import { loadMonaco, type MonacoModule } from '@/utils/monacoLoader'
import { useAppStore, useAppTheme, selectTheme } from '../stores/appStore'

/**
 * Monaco 编辑器 hook（D8：统一 Vue 版 useMonacoEditor 与 SqlEditor 内联创建两套封装）。
 *
 * 职责边界：负责「创建/销毁 + 应用设置（主题/字号/字体/minimap/行号）响应」；
 * 组件专属的事件、命令、decorations 经 onReady 回调在创建完成后自行绑定。
 * SqlEditor 的深度定制创建参数经 extraOptions 传入（仅创建时应用）。
 *
 * monacoLoader 原样复用（按需加载 SQL/Shell 语言的单例）；
 * worker 经 main.tsx 的 Vite ?worker 标准方案加载（修复 Vue 版损坏的 getWorkerUrl 配置）。
 */

export interface MonacoEditorHookOptions {
  language?: string
  readOnly?: boolean
  /** 覆盖主题（默认跟随 appStore：dark→vs-dark / light→vs） */
  theme?: string
  minimap?: boolean
  lineNumbers?: 'on' | 'off'
  value?: string
  fontSize?: number
  scrollBeyondLastLine?: boolean
  /** 深度定制创建参数（quickSuggestions 等），仅创建时应用 */
  extraOptions?: Record<string, unknown>
  /** 创建完成回调：绑定事件/命令/decorations（editor 已可用） */
  onReady?: (editor: any, monaco: MonacoModule) => void
}

export function useMonacoEditor(
  containerRef: RefObject<HTMLElement | null>,
  options: MonacoEditorHookOptions = {},
) {
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<MonacoModule | null>(null)
  const [ready, setReady] = useState(false)

  // onReady/初始 value 等仅在创建时读取，经 ref 取最新值
  const optionsRef = useRef(options)
  optionsRef.current = options

  const theme = useAppTheme()
  const editorSettings = useAppStore((s) => s.editorSettings)

  // 创建/销毁（挂载一次；StrictMode 双执行经 disposed 标记与 dispose 兜底）
  useEffect(() => {
    let disposed = false

    void (async () => {
      if (editorRef.current) return
      const monaco = await loadMonaco()
      if (disposed || !containerRef.current) return
      monacoRef.current = monaco

      const opts = optionsRef.current
      const settings = useAppStore.getState().editorSettings
      const resolvedTheme = opts.theme
        || (selectTheme(useAppStore.getState()) === 'dark' ? 'vs-dark' : 'vs')

      editorRef.current = monaco.editor.create(containerRef.current, {
        language: opts.language || 'sql',
        theme: resolvedTheme,
        readOnly: opts.readOnly ?? false,
        domReadOnly: false,
        minimap: { enabled: opts.minimap ?? settings.minimap },
        lineNumbers: opts.lineNumbers ?? settings.lineNumbers,
        automaticLayout: true,
        value: opts.value || '',
        fontSize: opts.fontSize ?? settings.fontSize,
        fontFamily: settings.fontFamily,
        scrollBeyondLastLine: opts.scrollBeyondLastLine ?? false,
        ...opts.extraOptions,
      })
      opts.onReady?.(editorRef.current, monaco)
      setReady(true)
    })()

    return () => {
      disposed = true
      if (editorRef.current) {
        editorRef.current.dispose()
        editorRef.current = null
        setReady(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 设置响应（对等 Vue 版 immediate watch：创建时参数已用当前值，此后跟随变化）
  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return
    const opts = optionsRef.current
    monaco.editor.setTheme(opts.theme || (theme === 'dark' ? 'vs-dark' : 'vs'))
    editor.updateOptions({
      readOnly: opts.readOnly ?? false,
      domReadOnly: false,
      fontSize: opts.fontSize ?? editorSettings.fontSize,
      fontFamily: editorSettings.fontFamily,
      minimap: { enabled: opts.minimap ?? editorSettings.minimap },
      lineNumbers: opts.lineNumbers ?? editorSettings.lineNumbers,
    })
  }, [ready, theme, editorSettings])

  const getValue = (): string => editorRef.current?.getValue() || ''
  const setValue = (value: string) => { editorRef.current?.setValue(value) }

  return { editorRef, monacoRef, ready, getValue, setValue }
}
