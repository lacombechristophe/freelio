import { afterAll, beforeAll, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { requestContext, type RequestContext } from "@/lib/context"

const companies: string[] = []
beforeAll(async () => {
  for (const name of ["Fictional queued company A", "Fictional queued company B"]) {
    const company = await prisma.company.create({ data: { name } })
    companies.push(company.id)
    await prisma.client.create({ data: { companyId: company.id, name } })
  }
})
afterAll(async () => {
  await prisma.client.deleteMany({ where: { companyId: { in: companies } } })
  await prisma.company.deleteMany({ where: { id: { in: companies } } })
})

it("forwards one SQLite transaction at a time and keeps both real tenant projections isolated", async () => {
  const engine = (globalThis as unknown as { prisma: { $transaction(...args: unknown[]): Promise<unknown> } }).prisma
  const transaction = engine.$transaction.bind(engine)
  let active = 0, maximum = 0
  const spy = vi.spyOn(engine, "$transaction").mockImplementation(async (...args) => {
    maximum = Math.max(maximum, ++active)
    try { return await transaction(...args) } finally { active-- }
  })
  let release!: () => void, entered!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { entered = resolve })
  const context = (companyId: string): RequestContext => ({ companyId, userId: "fictional-owner", membershipId: "fixture", role: "OWNER", agencyIds: null })
  try {
    const first = requestContext.run(context(companies[0]), () => prisma.$transaction(async tx => {
      const clients = await tx.client.findMany({ select: { companyId: true } })
      entered()
      await gate
      return clients
    }))
    await started
    const second = requestContext.run(context(companies[1]), () => prisma.$transaction(tx => tx.client.findMany({ select: { companyId: true } })))
    await Promise.resolve()
    release()
    const [firstRows, secondRows] = await Promise.all([first, second])
    expect(firstRows.map(row => row.companyId)).toEqual([companies[0]])
    expect(secondRows.map(row => row.companyId)).toEqual([companies[1]])
    expect(maximum).toBe(process.env.DATABASE_URL?.startsWith("file:") ? 1 : 2)
  } finally {
    release()
    spy.mockRestore()
  }
})
