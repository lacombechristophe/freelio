/** One in-flight run; stop prevents new work and waits for the current task. */
export function periodicProcessor(task: () => Promise<void>, intervalMs: number) {
  let stopping = false
  let running: Promise<void> | undefined
  function run(): Promise<void> {
    if (stopping) return Promise.resolve()
    if (running) return running
    running = Promise.resolve().then(task).finally(() => { running = undefined })
    return running
  }
  // Tasks report their own errors; an unexpected rejection must reach the worker
  // supervisor instead of silently continuing with an unhealthy processor.
  const timer = setInterval(() => { void run() }, intervalMs)
  return {
    run,
    async stop() {
      stopping = true
      clearInterval(timer)
      await running
    },
  }
}
