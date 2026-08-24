/**
 * BullMQ Worker — Document Generation & Email Queue Processor
 *
 * Run separately from the Next.js app:
 *   npx tsx src/worker.ts
 *   (or: npm run worker)
 *
 * Requires Redis running on REDIS_HOST:REDIS_PORT (default: localhost:6379)
 */
import { docGenWorker } from "@/lib/bullmq/worker"
import { processDueSequenceEmails } from "@/lib/automations/sequences"

console.log("[Worker] Starting BullMQ workers...")
console.log(`[Worker] Redis: ${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`)

let automationRunning = false
const processAutomations = async () => {
  if (automationRunning) return
  automationRunning = true
  try {
    const result = await processDueSequenceEmails(100)
    if (result.examined) console.log(`[Worker] Email sequences: ${result.sent} sent, ${result.failed} failed, ${result.stopped} stopped.`)
  } catch (error) {
    console.error(`[Worker] Email sequence processing failed: ${error instanceof Error ? error.message : "unknown error"}`)
  } finally {
    automationRunning = false
  }
}
const automationInterval = process.env.RESEND_API_KEY ? setInterval(() => { void processAutomations() }, 60_000) : null
if (automationInterval) void processAutomations()
else console.log("[Worker] Email sequences disabled: RESEND_API_KEY is not configured.")

process.on("SIGTERM", async () => {
  console.log("[Worker] SIGTERM received, closing workers...")
  if (automationInterval) clearInterval(automationInterval)
  await docGenWorker.close()
  process.exit(0)
})

process.on("SIGINT", async () => {
  console.log("[Worker] SIGINT received, closing workers...")
  if (automationInterval) clearInterval(automationInterval)
  await docGenWorker.close()
  process.exit(0)
})

console.log("[Worker] DOC_GEN and email sequence processors are ready.")
