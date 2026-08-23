import { Queue } from "bullmq"

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
}

export const docGenQueue = new Queue("DOC_GEN", { connection })
export const emailQueue = new Queue("EMAILS", { connection })

export async function enqueueDocGen(type: "QUOTE" | "INVOICE", id: string, version: number = 1) {
  return await docGenQueue.add(`${type}_${id}`, { type, id, version }, {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 }
  })
}

export async function enqueueEmail(template: string, to: string, payload: any) {
  return await emailQueue.add(`MAIL_${to}`, { template, to, payload }, {
    attempts: 5,
    backoff: { type: "fixed", delay: 5000 }
  })
}
