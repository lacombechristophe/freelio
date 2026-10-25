import { Prisma } from "@/generated/prisma/client"

export type SqliteTransactionQueue = { tail?: Promise<void> }

// Queue only the wait for a connection; the transaction keeps its own timeout.
export function runSqliteTransaction<T>(queue: SqliteTransactionQueue, execute: (remainingWait: number) => Promise<T>, maxWait = 2_000): Promise<T> {
  const startedAt = performance.now()
  let expired = false
  let timer: ReturnType<typeof setTimeout>
  const error = new Prisma.PrismaClientKnownRequestError("Transaction API error: Unable to start a transaction in the given time.", {
    code: "P2028", clientVersion: Prisma.prismaVersion.client,
    meta: { error: "Unable to start a transaction in the given time." },
  })
  const wait = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expired = true; reject(error) }, maxWait)
  })
  const result = (queue.tail ?? Promise.resolve()).then(() => {
    const remaining = Math.ceil(maxWait - (performance.now() - startedAt))
    if (expired || remaining <= 0) throw error
    clearTimeout(timer)
    return execute(remaining)
  })
  queue.tail = result.then(() => undefined, () => undefined)
  return Promise.race([result, wait]).finally(() => clearTimeout(timer))
}
