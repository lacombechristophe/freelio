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
import { processScheduledBusinessJobs } from "@/lib/scheduling/business"
import { syncDueOAuthEmailChannels } from "@/lib/communications/email-sync"

console.log("[Worker] Starting BullMQ workers...")
console.log(`[Worker] Redis: ${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`)

let automationRunning = false
const processAutomations = async () => {
  if (automationRunning) return
  automationRunning = true
  try {
    const result = await processDueSequenceEmails(100)
    if (result.examined) console.log(`[Worker] Sequences: ${result.sent} email(s), ${result.tasksCreated} task(s), ${result.tasksWaiting} waiting, ${result.failed} failed, ${result.stopped} stopped.`)
  } catch (error) {
    console.error(`[Worker] Sequence processing failed: ${error instanceof Error ? error.message : "unknown error"}`)
  } finally {
    automationRunning = false
  }
}
const automationInterval = setInterval(() => { void processAutomations() }, 60_000)
void processAutomations()
if (!process.env.RESEND_API_KEY) console.log("[Worker] Automatic email steps will retry until RESEND_API_KEY is configured; manual sequence tasks remain active.")

let schedulingRunning = false
const processScheduling = async () => {
  if (schedulingRunning) return
  schedulingRunning = true
  try {
    const result = await processScheduledBusinessJobs()
    const activity = result.recurringInvoices.generated + result.maintenanceVisits.scheduled
    if (activity) console.log(`[Worker] Scheduling: ${result.recurringInvoices.generated} invoice(s), ${result.maintenanceVisits.scheduled} maintenance visit(s).`)
  } catch (error) {
    console.error(`[Worker] Business scheduling failed: ${error instanceof Error ? error.message : "unknown error"}`)
  } finally {
    schedulingRunning = false
  }
}
const schedulingInterval = setInterval(() => { void processScheduling() }, 5 * 60_000)
void processScheduling()

let communicationSyncRunning = false
const processCommunicationSync = async () => {
  if (communicationSyncRunning) return
  communicationSyncRunning = true
  try {
    const result = await syncDueOAuthEmailChannels(10)
    if (result.imported || result.failed) console.log(`[Worker] Mail sync: ${result.imported} imported, ${result.failed} failed.`)
  } catch (error) {
    console.error(`[Worker] Mail sync failed: ${error instanceof Error ? error.message : "unknown error"}`)
  } finally {
    communicationSyncRunning = false
  }
}
const communicationSyncInterval = setInterval(() => { void processCommunicationSync() }, 5 * 60_000)
void processCommunicationSync()

process.on("SIGTERM", async () => {
  console.log("[Worker] SIGTERM received, closing workers...")
  if (automationInterval) clearInterval(automationInterval)
  clearInterval(schedulingInterval)
  clearInterval(communicationSyncInterval)
  await docGenWorker.close()
  process.exit(0)
})

process.on("SIGINT", async () => {
  console.log("[Worker] SIGINT received, closing workers...")
  if (automationInterval) clearInterval(automationInterval)
  clearInterval(schedulingInterval)
  clearInterval(communicationSyncInterval)
  await docGenWorker.close()
  process.exit(0)
})

console.log("[Worker] Document, email sequence and business scheduling processors are ready.")
