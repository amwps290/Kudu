<template>
  <div class="command-input-section">
    <div ref="editorContainer" class="editor-wrapper"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { registerRedisCompletionProvider } from '@/services/redisAutocomplete'
import { useAppStore } from '@/stores/app'
import { loadMonaco, type MonacoModule } from '@/utils/monacoLoader'

const props = defineProps<{
  initialValue?: string
}>()

const emit = defineEmits<{
  execute: []
  cursorChange: [line: number, column: number]
}>()

const appStore = useAppStore()
const editorContainer = ref<HTMLElement>()
let editor: any = null
let monacoInstance: MonacoModule | null = null

onMounted(async () => {
  if (!editorContainer.value) return

  const monaco = await loadMonaco()
  monacoInstance = monaco

  editor = monaco.editor.create(editorContainer.value, {
    value: props.initialValue || '# 在此输入 Redis 命令\n# PING - 测试连接是否正常\n# INFO - 查看服务器信息\n# GET key - 获取键值\n# SET key value - 设置键值\n\nPING',
    language: 'shell',
    theme: appStore.theme === 'dark' ? 'vs-dark' : 'vs',
    automaticLayout: true,
    readOnly: false,
    domReadOnly: false,
    fontSize: appStore.editorSettings.fontSize,
    fontFamily: appStore.editorSettings.fontFamily,
    minimap: { enabled: appStore.editorSettings.minimap },
    scrollBeyondLastLine: false,
    lineNumbers: appStore.editorSettings.lineNumbers,
    renderLineHighlight: 'all',
    quickSuggestions: {
      other: true,
      comments: false,
      strings: false
    },
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnCommitCharacter: true,
    acceptSuggestionOnEnter: 'on',
    tabCompletion: 'on',
  })

  await registerRedisCompletionProvider()

  editor.onDidChangeCursorPosition((e: any) => {
    emit('cursorChange', e.position.lineNumber, e.position.column)
  })

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    emit('execute')
  })
})

onUnmounted(() => {
  editor?.dispose()
})

watch(
  () => [appStore.theme, appStore.editorSettings.fontSize, appStore.editorSettings.minimap, appStore.editorSettings.lineNumbers, appStore.editorSettings.fontFamily],
  ([theme]) => {
    if (editor && monacoInstance) {
      monacoInstance.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs')
      editor.updateOptions({
        readOnly: false,
        domReadOnly: false,
        fontSize: appStore.editorSettings.fontSize,
        fontFamily: appStore.editorSettings.fontFamily,
        minimap: { enabled: appStore.editorSettings.minimap },
        lineNumbers: appStore.editorSettings.lineNumbers,
      })
    }
  }
)

function getValue(): string {
  return editor?.getValue()?.trim() || ''
}

function setValue(value: string) {
  editor?.setValue(value)
}

defineExpose({ getValue, setValue })
</script>

<style scoped>
.editor-wrapper {
  flex: 1;
  min-height: 300px;
  border-bottom: 1px solid #e8e8e8;
}

.dark-mode .editor-wrapper {
  border-bottom-color: #303030;
}
</style>
