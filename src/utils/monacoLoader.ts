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
    ]).then(([monaco]) => monaco)
  }

  return monacoPromise
}
