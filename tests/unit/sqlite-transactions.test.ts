import { afterEach, expect, it, vi } from "vitest"
import { runSqliteTransaction, type SqliteTransactionQueue } from "@/lib/sqlite-transactions"
import { getContext, requestContext, type RequestContext } from "@/lib/context"

afterEach(() => vi.useRealTimers())
function gate() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

it("starts queued callbacks in order without overlapping their execution", async () => {
  const queue: SqliteTransactionQueue = {}, firstGate = gate(), started = gate()
  const order: string[] = []
  const first = runSqliteTransaction(queue, async () => { order.push("first"); started.release(); await firstGate.promise; order.push("first done"); return 1 })
  await started.promise
  const second = runSqliteTransaction(queue, async remaining => { expect(remaining).toBeGreaterThan(0); order.push("second"); return 2 })
  await Promise.resolve()
  expect(order).toEqual(["first"])
  firstGate.release()
  expect(await Promise.all([first, second])).toEqual([1, 2])
  expect(order).toEqual(["first", "first done", "second"])
})

it("keeps the next transaction runnable after a rejection", async () => {
  const queue: SqliteTransactionQueue = {}
  const failure = Error("Fictional transaction refusal")
  const first = runSqliteTransaction(queue, async () => { throw failure })
  const second = runSqliteTransaction(queue, async () => "retained")
  await expect(first).rejects.toBe(failure)
  await expect(second).resolves.toBe("retained")
})

it("keeps a short connection wait valid when the wall clock changes", async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  const queue: SqliteTransactionQueue = {}, firstGate = gate(), started = gate()
  const first = runSqliteTransaction(queue, async () => { started.release(); await firstGate.promise })
  await started.promise
  const second = runSqliteTransaction(queue, async () => "retained")
  vi.setSystemTime(Date.now() + 86_400_000)
  firstGate.release()
  await first
  await expect(second).resolves.toBe("retained")
})

it("expires the original connection wait budget without later running the callback", async () => {
  vi.useFakeTimers()
  const queue: SqliteTransactionQueue = {}, firstGate = gate(), started = gate()
  const first = runSqliteTransaction(queue, async () => { started.release(); await firstGate.promise })
  await started.promise
  const execute = vi.fn().mockResolvedValue("must not run")
  const expired = runSqliteTransaction(queue, execute, 25)
  const rejected = expect(expired).rejects.toMatchObject({ code: "P2028" })
  await vi.advanceTimersByTimeAsync(25)
  await rejected
  expect(execute).not.toHaveBeenCalled()
  firstGate.release()
  await first
  await queue.tail
  expect(execute).not.toHaveBeenCalled()
  await expect(runSqliteTransaction(queue, async () => "next")).resolves.toBe("next")
})

it("retains each caller's company and role across a shared queue", async () => {
  const queue: SqliteTransactionQueue = {}, firstGate = gate(), started = gate()
  const scope = (companyId: string, role: RequestContext["role"]): RequestContext => ({ companyId, userId: companyId, membershipId: companyId, role, agencyIds: null })
  const firstScope = scope("fiction-company-a", "OWNER"), secondScope = scope("fiction-company-b", "SALES")
  const first = requestContext.run(firstScope, () => runSqliteTransaction(queue, async () => { started.release(); await firstGate.promise; return getContext() }))
  await started.promise
  const second = requestContext.run(secondScope, () => runSqliteTransaction(queue, async () => getContext()))
  firstGate.release()
  expect(await first).toEqual(firstScope)
  expect(await second).toEqual(secondScope)
})
