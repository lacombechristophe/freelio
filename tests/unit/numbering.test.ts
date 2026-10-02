import { afterEach, beforeEach, describe, expect, it } from "vitest"
import prisma from "@/lib/prisma"
import { isUniqueConstraintConflict, nextDocumentNumber, withDocumentNumberRetry, readCompanyDocumentNumbers } from "@/lib/document-numbering"
import { getContext, requestContext } from "@/lib/context"

describe("Document numbering", () => {
  const companyId = "test-company-id"
  const clientId = "test-client"
  const prefix = "FACT-2026-"

  beforeEach(async () => {
    await prisma.invoice.deleteMany({ where: { companyId } })

    let company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) {
      company = await prisma.company.create({
        data: {
          id: companyId,
          name: "Test Company",
          isTvaApplicable: true,
        },
      })
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } })
    if (!client) {
      await prisma.client.create({
        data: {
          id: clientId,
          companyId,
          name: "Test Client",
        },
      })
    }
  })

  afterEach(async () => {
    await prisma.invoice.deleteMany({ where: { companyId } })
  })

  it("builds the next yearly number from the highest existing suffix", () => {
    expect(nextDocumentNumber(null, prefix)).toBe("FACT-2026-001")
    expect(nextDocumentNumber("FACT-2026-009", prefix)).toBe("FACT-2026-010")
    expect(nextDocumentNumber("FACT-2026-099", prefix)).toBe("FACT-2026-100")
  })

  it("distinguishes the business idempotency key from a document number collision", () => {
    const quoteConflict = { code: "P2002", meta: { target: ["quoteId"] } }
    expect(isUniqueConstraintConflict(quoteConflict, "quoteId")).toBe(true)
    expect(isUniqueConstraintConflict(quoteConflict, "number")).toBe(false)
  })

  it("retries after a unique document number collision", async () => {
    let injectCollision = true

    const created = await withDocumentNumberRetry(async () => {
      const last = await prisma.invoice.findMany({
        where: { companyId, number: { startsWith: prefix } },
        select: { number: true },
      })
      const number = nextDocumentNumber(last, prefix)

      if (injectCollision) {
        injectCollision = false
        await prisma.invoice.create({
          data: {
            companyId,
            clientId,
            number,
            object: "Collision fixture",
            dueDate: new Date("2026-01-31"),
            totalHtCents: 1000,
            totalTvaCents: 200,
            totalTtcCents: 1200,
          },
        })
      }

      return await prisma.invoice.create({
        data: {
          companyId,
          clientId,
          number,
          object: "Retried invoice",
          dueDate: new Date("2026-01-31"),
          totalHtCents: 1000,
          totalTvaCents: 200,
          totalTtcCents: 1200,
        },
      })
    }, { label: "la facture de test" })

    const invoices = await prisma.invoice.findMany({
      where: { companyId },
      orderBy: { number: "asc" },
      select: { number: true },
    })

    expect(created.number).toBe("FACT-2026-002")
    expect(invoices.map((invoice) => invoice.number)).toEqual([
      "FACT-2026-001",
      "FACT-2026-002",
    ])
  })
  it("allocates after 1000 on the actual database without renumbering historic records", async () => {
    const base = { companyId, clientId, object: "Boundary fixture", dueDate: new Date("2026-10-31"), totalHtCents: 1000, totalTvaCents: 200, totalTtcCents: 1200 }
    await prisma.invoice.createMany({ data: [{ ...base, number: prefix + "999" }, { ...base, number: prefix + "1000" }] })
    const numbers = await prisma.invoice.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } })
    const created = await prisma.invoice.create({ data: { ...base, number: nextDocumentNumber(numbers, prefix) } })
    expect(created.number).toBe(prefix + "1001")
    expect(await prisma.invoice.count({ where: { companyId, number: { in: [prefix + "999", prefix + "1000"] } } })).toBe(2)
  })
  it("allocates twenty concurrent writes uniquely on the actual database", async () => {
    const created = await Promise.all(Array.from({ length: 20 }, () => withDocumentNumberRetry(async () => {
      const catalogue = await prisma.invoice.findMany({ where: { companyId, number: { startsWith: prefix } }, select: { number: true } })
      return prisma.invoice.create({ data: { companyId, clientId, number: nextDocumentNumber(catalogue, prefix), object: "Concurrent synthetic allocation", dueDate: new Date("2026-10-31"), totalHtCents: 1000, totalTvaCents: 200, totalTtcCents: 1200 } })
    })))
    expect(new Set(created.map(invoice => invoice.number)).size).toBe(20)
    expect(created.map(invoice => Number(invoice.number.slice(prefix.length))).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1))
  })
  it("restores the agency scope after reading the company-wide number catalogue", async () => {
    await requestContext.run({ companyId, userId: "synthetic", membershipId: "synthetic", role: "ACCOUNTING", agencyIds: ["a1"], actionPermission: "finance.write" }, async () => {
      expect(await readCompanyDocumentNumbers(async () => ({ companyId: getContext()?.companyId, agencyIds: getContext()?.agencyIds }))).toEqual({ companyId, agencyIds: null })
      expect(getContext()?.agencyIds).toEqual(["a1"])
    })
  })
})
