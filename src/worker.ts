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

console.log("[Worker] Starting BullMQ workers...")
console.log(`[Worker] Redis: ${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`)

process.on("SIGTERM", async () => {
  console.log("[Worker] SIGTERM received, closing workers...")
  await docGenWorker.close()
  process.exit(0)
})

process.on("SIGINT", async () => {
  console.log("[Worker] SIGINT received, closing workers...")
  await docGenWorker.close()
  process.exit(0)
})

console.log("[Worker] DOC_GEN worker listening for jobs.")
