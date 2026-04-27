import { invoke } from '@tauri-apps/api/core'

const startupOrigin = performance.now()
const loggedStages = new Set<string>()

function nowMs() {
  return performance.now() - startupOrigin
}

export async function logStartupStage(stage: string, details?: string, force = false) {
  if (!force && loggedStages.has(stage)) return
  loggedStages.add(stage)

  const elapsedMs = nowMs()
  const suffix = details ? ` | ${details}` : ''
  console.info(`[startup][frontend] ${stage} +${elapsedMs.toFixed(2)}ms${suffix}`)

  try {
    await invoke('log_frontend_timing', {
      stage,
      elapsedMs,
      details: details || null,
    })
  } catch (error) {
    console.warn('[startup][frontend] failed to forward timing log', stage, error)
  }
}

export function createStartupTimer(stage: string) {
  const start = performance.now()
  return async (details?: string) => {
    const elapsedMs = performance.now() - start
    const logStage = `${stage} (duration)`
    const suffix = details ? ` | ${details}` : ''
    console.info(`[startup][frontend] ${logStage} ${elapsedMs.toFixed(2)}ms${suffix}`)

    try {
      await invoke('log_frontend_timing', {
        stage: logStage,
        elapsedMs,
        details: details || null,
      })
    } catch (error) {
      console.warn('[startup][frontend] failed to forward duration log', logStage, error)
    }
  }
}
