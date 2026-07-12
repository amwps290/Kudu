/**
 * 错误提示通知器：由宿主 UI 在启动时注入（Vue 版为 antdv 的 message.error，
 * React 版为 antd 的 message.error）。共享层不直接依赖任一 UI 框架；
 * 未注入时降级为 console.error。
 */
export type ErrorNotifier = (text: string) => void

let errorNotifier: ErrorNotifier = (text) => {
  console.error(text)
}

export function setErrorNotifier(notifier: ErrorNotifier) {
  errorNotifier = notifier
}

/**
 * 从各种错误对象中提取可读的错误消息
 */
export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const msg = Reflect.get(error, 'message')
    if (typeof msg === 'string' && msg.trim()) return msg
    const err = Reflect.get(error, 'error')
    if (typeof err === 'string' && err.trim()) return err
    const cause = Reflect.get(error, 'cause')
    if (cause) {
      const cm = getErrorMessage(cause)
      if (cm && cm !== '[object Object]') return cm
    }
    try { return JSON.stringify(error) } catch { return String(error) }
  }
  return String(error)
}

export interface ErrorHandlerOptions {
  showMessage?: boolean
  messagePrefix?: string
  rethrow?: boolean
  onError?: (error: unknown) => void
}

/**
 * 包装异步函数的错误处理工具
 * 自动打印日志并显示 UI 提示
 */
export async function withErrorHandler<T>(
  fn: () => Promise<T>,
  options: ErrorHandlerOptions = {}
): Promise<T | undefined> {
  const {
    showMessage = true,
    messagePrefix = '操作失败',
    rethrow = false,
    onError
  } = options

  try {
    return await fn()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // 控制台记录详细错误
    console.error(`${messagePrefix}:`, error)

    // 显示用户友好的错误消息
    if (showMessage) {
      errorNotifier(`${messagePrefix}: ${errorMessage}`)
    }

    // 执行自定义回调
    if (onError) {
      onError(error)
    }

    // 根据需要重新抛出
    if (rethrow) {
      throw error
    }

    return undefined
  }
}
