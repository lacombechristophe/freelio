/**
 * BullMQ document worker and periodic business processors
 *
 * Run separately from the Next.js app:
 *   npm run worker
 *
 * Requires REDIS_URL or explicit REDIS_HOST in production.
 */
import { docGenWorker } from "@/lib/bullmq/worker"
import { processAutomationBatch } from "@/lib/automations/process"
import { processScheduledBusinessJobs } from "@/lib/scheduling/business"
import { syncDueOAuthCommunicationChannels } from "@/lib/communications/communication-sync"
import { withProcessorLease } from "@/lib/processing/lease"
import { periodicProcessor } from "@/lib/processing/periodic"
import prisma from "@/lib/prisma"
import { publicDemoConfigurationIssues } from "@/lib/demo-configuration"

// Public read-only deployments must never start background mutations.
if (process.env.DEMO_ACCESS_MODE === "readonly" || process.env.NEXT_PUBLIC_DEMO_READ_ONLY === "true") throw new Error("Le worker est interdit dans la démonstration publique")
const configurationIssues = publicDemoConfigurationIssues()
if (configurationIssues.length) throw new Error(`Configuration invalide : ${configurationIssues.join(", ")}`)

console.log("[Worker] Starting BullMQ workers...")
console.log("[Worker] Redis connection configured; credentials are never printed.")

const processAutomations = async () => {
  try {
    const [scenarios, sequences, activations] = await processAutomationBatch()
    if (activations.status === "fulfilled") {
      if (activations.value.examined) console.log(`[Worker] Campaign activations: ${activations.value.processed} processed, ${activations.value.enrolled} enrolled, ${activations.value.failed} failed.`)
    } else console.error("[Worker] Campaign activation processing failed", activations.reason)
    if (scenarios.status === "fulfilled") {
      if (scenarios.value.examined) console.log(`[Worker] Scenarios: ${scenarios.value.examined} event(s), ${scenarios.value.completed} workflow(s) completed.`)
    } else console.error("[Worker] Scenario processing failed", scenarios.reason)
    if (sequences.status === "fulfilled") {
      const result = sequences.value
      if (result.examined) console.log(`[Worker] Sequences: ${result.sent} email(s), ${result.tasksCreated} task(s), ${result.tasksWaiting} waiting, ${result.failed} failed, ${result.stopped} stopped.`)
    } else console.error("[Worker] Sequence processing failed", sequences.reason)
  } catch (error) {
    console.error(`[Worker] Sequence processing failed: ${error instanceof Error ? error.message : "unknown error"}`)
  }
}
const automationProcessor = periodicProcessor(processAutomations, 60_000)
void automationProcessor.run()
if (!process.env.RESEND_API_KEY) console.log("[Worker] Automatic email steps will retry until RESEND_API_KEY is configured; manual sequence tasks remain active.")

const processScheduling = async () => {
  try {
    const lease = await withProcessorLease("business-scheduling", processScheduledBusinessJobs)
    if (!lease.acquired) return
    const result = lease.value
    const activity = result.recurringInvoices.generated + result.maintenanceVisits.scheduled + result.invoiceReminders.sent + result.invoiceReminders.failed + result.scheduledEmails.sent + result.scheduledEmails.failed + result.contractArchives.generated + result.contractArchives.failed
    if (activity) console.log(`[Worker] Scheduling: ${result.recurringInvoices.generated} invoice(s), ${result.maintenanceVisits.scheduled} maintenance visit(s), ${result.invoiceReminders.sent} reminder(s), ${result.invoiceReminders.failed} reminder failure(s), ${result.scheduledEmails.sent} scheduled email(s), ${result.scheduledEmails.failed} scheduled email failure(s), ${result.contractArchives.generated} contract archive(s), ${result.contractArchives.failed} contract archive failure(s).`)
  } catch (error) {
    console.error(`[Worker] Business scheduling failed: ${error instanceof Error ? error.message : "unknown error"}`)
  }
}
const schedulingProcessor = periodicProcessor(processScheduling, 5 * 60_000)
void schedulingProcessor.run()

const processCommunicationSync = async () => {
  try {
    const lease = await withProcessorLease("communication-sync", () => syncDueOAuthCommunicationChannels(10))
    if (!lease.acquired) return
    const result = lease.value
    if (result.messagesImported || result.calendarEventsImported || result.failed) console.log(`[Worker] Communication sync: ${result.messagesImported} message(s), ${result.calendarEventsImported} événement(s), ${result.failed} échec(s).`)
  } catch (error) {
    console.error(`[Worker] Mail sync failed: ${error instanceof Error ? error.message : "unknown error"}`)
  }
}
const communicationSyncProcessor = periodicProcessor(processCommunicationSync, 5 * 60_000)
void communicationSyncProcessor.run()

let closing = false
async function shutdown(signal: string) {
  if (closing) return
  closing = true
  console.log(`[Worker] ${signal} received; draining in-flight processors...`)
  const deadline = setTimeout(() => {
    console.error("[Worker] Graceful shutdown exceeded 30 seconds; supervisor recovery is required.")
    process.exit(1)
  }, 30_000)
  deadline.unref()
  try {
    await Promise.all([docGenWorker.close(), automationProcessor.stop(), schedulingProcessor.stop(), communicationSyncProcessor.stop()])
    await prisma.$disconnect()
    clearTimeout(deadline)
    process.exit(0)
  } catch {
    console.error("[Worker] Graceful shutdown failed.")
    process.exit(1)
  }
}
process.on("SIGTERM", () => { void shutdown("SIGTERM") })
process.on("SIGINT", () => { void shutdown("SIGINT") })

console.log("[Worker] Document, email, calendar and business scheduling processors are ready.")
