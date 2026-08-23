import { afterEach, beforeEach, describe, expect, it } from "vitest"
import prisma from "@/lib/prisma"
import { nextDocumentNumber, withDocumentNumberRetry } from "@/lib/document-numbering"

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

  it("retries after a unique document number collision", async () => {
    let injectCollision = true

    const created = await withDocumentNumberRetry(async () => {
      const last = await prisma.invoice.findFirst({
        where: { companyId, number: { startsWith: prefix } },
        orderBy: { number: "desc" },
        select: { number: true },
      })
      const number = nextDocumentNumber(last?.number, prefix)

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
})
