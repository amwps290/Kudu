export type MonacoModule = any

let monacoPromise: Promise<MonacoModule> | null = null

export async function loadMonaco(): Promise<MonacoModule> {
  if (!monacoPromise) {
    monacoPromise = Promise.all([
      import('monaco-editor/esm/vs/editor/editor.api'),
      import('monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController'),
      import('monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2'),
      import('monaco-editor/esm/vs/basic-languages/sql/sql.contribution'),
      import('monaco-editor/esm/vs/basic-languages/shell/shell.contribution'),
    ]).then(([monaco]) => {
      // 定义与应用面板一致的 Kudu 主题（单例 init 路径，仅执行一次）
      monaco.editor.defineTheme('kudu-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#1f1f1f',
          'editor.lineHighlightBackground': '#242424',
          'editor.selectionBackground': '#3574f04d',
          'editorLineNumber.foreground': '#5a5a5a',
          'editorLineNumber.activeForeground': '#a8a8a8',
          'editorGutter.background': '#1f1f1f',
        },
      })
      monaco.editor.defineTheme('kudu-light', {
        base: 'vs',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#ffffff',
          'editor.lineHighlightBackground': '#f5f5f5',
          'editor.selectionBackground': '#3574f02e',
          'editorLineNumber.foreground': '#b0b0b0',
          'editorLineNumber.activeForeground': '#707070',
        },
      })
      return monaco
    })
  }

  return monacoPromise
}
