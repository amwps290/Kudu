import { onBeforeUnmount, watch, type Ref, shallowRef, nextTick } from 'vue'
import { useAppStore } from '@/stores/app'
import { loadMonaco, type MonacoModule } from '@/utils/monacoLoader'

export interface MonacoEditorOptions {
  language?: string
  readOnly?: boolean
  theme?: string
  minimap?: boolean
  lineNumbers?: 'on' | 'off'
  value?: string
  fontSize?: number
  scrollBeyondLastLine?: boolean
}

export function useMonacoEditor(
  containerRef: Ref<HTMLElement | undefined | null>,
  options: MonacoEditorOptions = {}
) {
  const editor = shallowRef<any>(null)
  const monacoRef = shallowRef<MonacoModule | null>(null)
  const appStore = useAppStore()

  const getTheme = () => {
    if (options.theme) return options.theme
    return appStore.theme === 'dark' ? 'vs-dark' : 'vs'
  }

  const getEditorOptionValues = () => ({
    fontSize: options.fontSize ?? appStore.editorSettings.fontSize,
    minimap: options.minimap ?? appStore.editorSettings.minimap,
    lineNumbers: options.lineNumbers ?? appStore.editorSettings.lineNumbers,
    fontFamily: appStore.editorSettings.fontFamily,
  })

  const createEditor = async () => {
    if (editor.value) return
    await nextTick()
    if (!containerRef.value) return

    const monaco = await loadMonaco()
    monacoRef.value = monaco

    const editorOptions = getEditorOptionValues()

    editor.value = monaco.editor.create(containerRef.value, {
      language: options.language || 'sql',
      theme: getTheme(),
      readOnly: options.readOnly ?? false,
      domReadOnly: false,
      minimap: { enabled: editorOptions.minimap },
      lineNumbers: editorOptions.lineNumbers,
      automaticLayout: true,
      value: options.value || '',
      fontSize: editorOptions.fontSize,
      fontFamily: editorOptions.fontFamily,
      scrollBeyondLastLine: options.scrollBeyondLastLine ?? false,
    })
  }

  const getValue = (): string => editor.value?.getValue() || ''

  const setValue = (value: string) => {
    if (editor.value) {
      editor.value.setValue(value)
    }
  }

  const dispose = () => {
    if (editor.value) {
      editor.value.dispose()
      editor.value = null
    }
  }

  watch(() => [appStore.theme, appStore.editorSettings.fontSize, appStore.editorSettings.minimap, appStore.editorSettings.lineNumbers, appStore.editorSettings.fontFamily], () => {
    if (editor.value && monacoRef.value) {
      monacoRef.value.editor.setTheme(getTheme())
      const editorOptions = getEditorOptionValues()
      editor.value.updateOptions({
        readOnly: options.readOnly ?? false,
        domReadOnly: false,
        fontSize: editorOptions.fontSize,
        fontFamily: editorOptions.fontFamily,
        minimap: { enabled: editorOptions.minimap },
        lineNumbers: editorOptions.lineNumbers,
      })
    }
  })

  onBeforeUnmount(() => dispose())

  return { editor, monacoRef, getValue, setValue, createEditor, dispose }
}
