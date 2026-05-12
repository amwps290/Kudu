export type MonacoModule = any

let monacoPromise: Promise<MonacoModule> | null = null

export async function loadMonaco(): Promise<MonacoModule> {
  if (!monacoPromise) {
    monacoPromise = Promise.all([
      import('monaco-editor/esm/vs/editor/editor.api'),
      import('monaco-editor/esm/vs/basic-languages/sql/sql.contribution'),
      import('monaco-editor/esm/vs/basic-languages/shell/shell.contribution'),
    ]).then(([monaco]) => monaco)
  }

  return monacoPromise
}
