import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { importBankTransactions } from "@/actions/bank"

describe.sequential("bank concurrency with real actions and SQL", () => {
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional concurrent bank" } })).id
    session.userId = (await prisma.user.create({ data: { email: `bank-race-${randomUUID()}@example.test` } })).id
    await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })
  })
  afterEach(async () => { await prisma.bankTransaction.deleteMany({ where: { companyId: session.companyId } }) })
  afterAll(async () => {
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("counts duplicate lines within a file and its subsequent replay", async () => {
    const row = { date: "2030-01-01", label: "Fictional repeated file row", amountCents: 100 }
    expect(await importBankTransactions({ rows: [row, row] })).toEqual({ imported: 1, ignored: 1 })
    expect(await importBankTransactions({ rows: [row, row] })).toEqual({ imported: 0, ignored: 2 })
    expect(await prisma.bankTransaction.count({ where: { companyId: session.companyId } })).toBe(1)
  })
  it("accepts concurrent copies of the same file and reports exactly the persisted rows", async () => {
    const input = { rows: Array.from({ length: 25 }, (_, index) => ({ date: "2030-01-01", label: `Fictional concurrent row ${index}`, amountCents: 100 + index })) }
    const copies = 8
    let arrivals = 0
    const firstReadCounts: number[] = []
    let release!: () => void
    const barrier = new Promise<void>(resolve => { release = resolve })
    const deadline = setTimeout(release, 2000)
    const read = prisma.bankTransaction.findMany.bind(prisma.bankTransaction)
    // Read the real SQL result, then hold it until every actor has observed it.
    // Neither the DAL, authentication, writes nor returned rows are replaced.
    const scheduledRead = async (...args: Parameters<typeof read>) => {
      const rows = await read(...args)
      if (arrivals < copies) {
        firstReadCounts.push(rows.length)
        if (++arrivals === copies) release()
        await barrier
      }
      return rows
    }
    // This wrapper supports the action's await, not Prisma batch transactions.
    const scheduling = vi.spyOn(prisma.bankTransaction, "findMany").mockImplementation(scheduledRead as typeof prisma.bankTransaction.findMany)
    let results: Awaited<ReturnType<typeof importBankTransactions>>[]
    try {
      const settled = await Promise.allSettled(Array.from({ length: copies }, () => importBankTransactions(input)))
      expect(arrivals).toBe(copies)
      expect(firstReadCounts).toEqual(Array(copies).fill(0))
      expect(settled.filter(result => result.status === "rejected")).toEqual([])
      results = settled.flatMap(result => result.status === "fulfilled" ? [result.value] : [])
    } finally { release(); clearTimeout(deadline); scheduling.mockRestore() }
    const values = results
    expect(values.reduce((sum, value) => sum + value.imported, 0)).toBe(25)
    expect(values.reduce((sum, value) => sum + value.ignored, 0)).toBe((copies - 1) * 25)
    expect(await prisma.bankTransaction.count({ where: { companyId: session.companyId } })).toBe(25)
  })
})
