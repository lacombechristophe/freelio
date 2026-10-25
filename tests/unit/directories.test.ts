import { beforeEach, describe, expect, it, vi } from "vitest"
import { parseDirectoryQuery } from "@/lib/directory-query"

const mocks = vi.hoisted(() => ({
  withAuth: vi.fn(async (action: (context: { companyId: string; role: "OWNER" }) => unknown) => action({ companyId: "tenant-a", role: "OWNER" })),
  quote: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
  invoice: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
  contact: { count: vi.fn(), findMany: vi.fn() },
}))
vi.mock("@/lib/auth-wrapper", () => ({ withAuth: mocks.withAuth }))
vi.mock("@/lib/prisma", () => ({ default: { quote: mocks.quote, invoice: mocks.invoice, contact: mocks.contact } }))
import { getContactDirectory, getInvoiceDirectory, getQuoteDirectory } from "@/actions/directories"

describe("commercial directories", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const model of [mocks.quote, mocks.invoice]) {
      model.count.mockResolvedValue(51)
      model.groupBy.mockResolvedValue([{ status: "SENT", _count: 51 }])
      model.findMany.mockResolvedValue([])
    }
    mocks.invoice.aggregate.mockResolvedValue({ _sum: { totalTtcCents: 12000, paidAmountCents: 4000 } })
  })
  it("scopes quote search, counts and pages to the authorized tenant", async () => {
    const result = await getQuoteDirectory({ ...parseDirectoryQuery(null), page: 99, search: "needle", status: "SENT" })
    expect(mocks.withAuth).toHaveBeenCalledWith(expect.any(Function), "sales.read")
    expect(mocks.quote.count).toHaveBeenCalledWith({ where: expect.objectContaining({ companyId: "tenant-a", status: "SENT", OR: expect.any(Array) }) })
    expect(mocks.quote.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 50, take: 25, where: expect.objectContaining({ companyId: "tenant-a" }) }))
    expect(result).toMatchObject({ total: 51, page: 3, counts: { ALL: 51, SENT: 51 } })
  })
  it("computes outstanding across issued invoices, independently of page and search", async () => {
    const result = await getInvoiceDirectory({ ...parseDirectoryQuery(null), search: "example" })
    expect(mocks.withAuth).toHaveBeenCalledWith(expect.any(Function), "finance.read")
    expect(mocks.invoice.aggregate).toHaveBeenCalledWith({ where: { companyId: "tenant-a", status: { in: ["SENT", "OVERDUE"] } }, _sum: { totalTtcCents: true, paidAmountCents: true } })
    expect(result.outstanding).toBe(8000)
  })
  it("rejects unbounded page input before reading data", async () => {
    await expect(getQuoteDirectory({ ...parseDirectoryQuery(null), page: -1 })).rejects.toThrow()
    expect(mocks.withAuth).not.toHaveBeenCalled()
  })
  it("keeps contacts scoped to their client company beyond the former 1000-row cap", async () => {
    mocks.contact.count.mockResolvedValue(2501)
    mocks.contact.findMany.mockResolvedValue([])
    const result = await getContactDirectory({ ...parseDirectoryQuery(null), page: 101, search: "needle", status: "OPTED_IN" })
    expect(mocks.withAuth).toHaveBeenCalledWith(expect.any(Function), "crm.read")
    expect(mocks.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 2500, take: 25, where: expect.objectContaining({ client: { companyId: "tenant-a" }, marketingStatus: "OPTED_IN", OR: expect.any(Array) }) }))
    expect(result).toMatchObject({ total: 2501, page: 101 })
  })
})
