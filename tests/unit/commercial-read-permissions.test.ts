import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), membership: vi.fn(), user: vi.fn(), invoiceList: vi.fn(), invoiceFind: vi.fn(),
  contractList: vi.fn(), contractFind: vi.fn(), invoiceUpdate: vi.fn(), recurring: vi.fn(),
}))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: mocks.auth }))
vi.mock("@/lib/prisma", () => ({ default: {
  membership: { findUnique: mocks.membership },
  user: { findUnique: mocks.user },
  invoice: { findMany: mocks.invoiceList, findFirst: mocks.invoiceFind, updateMany: mocks.invoiceUpdate },
  contract: { findMany: mocks.contractList, findFirst: mocks.contractFind },
} }))
vi.mock("@/lib/scheduling/business", () => ({ processDueRecurringInvoices: mocks.recurring }))
vi.mock("@/lib/finance/invoice-reminder-sender", () => ({ sendInvoiceReminderRecord: vi.fn() }))
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({ signatureRateLimit: { limit: vi.fn() } }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { getInvoices, getInvoiceById } from "@/actions/factures"
import { getContracts, getContractById } from "@/actions/contrats"
import { getContext } from "@/lib/context"

describe("Commercial reads use current membership permissions", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ user: { id: "reader-a", companyId: "company-a" } })
    mocks.user.mockResolvedValue({ companyId: "company-a" })
    mocks.membership.mockResolvedValue({ id: "member-a", role: "TECHNICIAN", status: "ACTIVE", agencyMemberships: [{ agencyId: "agency-a" }] })
    mocks.invoiceList.mockResolvedValue([])
    mocks.contractList.mockResolvedValue([])
    mocks.invoiceFind.mockResolvedValue(null)
    mocks.contractFind.mockResolvedValue(null)
  })

  it.each([getInvoices, () => getInvoiceById("invoice-a"), getContracts, () => getContractById("contract-a")])(
    "refuses an authenticated technician before any document query", async (read) => {
      await expect(read()).rejects.toThrow("droits nécessaires")
      expect(mocks.invoiceList).not.toHaveBeenCalled()
      expect(mocks.invoiceFind).not.toHaveBeenCalled()
      expect(mocks.contractList).not.toHaveBeenCalled()
      expect(mocks.contractFind).not.toHaveBeenCalled()
    },
  )

  it("lets VIEWER read invoices without mutations, recurring jobs or a write permission", async () => {
    mocks.membership.mockResolvedValue({ id: "member-a", role: "VIEWER", status: "ACTIVE", agencyMemberships: [] })
    mocks.invoiceList.mockImplementation(async () => {
      expect(getContext()).toMatchObject({ companyId: "company-a", role: "VIEWER", actionPermission: "finance.read" })
      return []
    })
    await expect(getInvoices()).resolves.toEqual([])
    expect(mocks.invoiceList).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: "company-a", client: { companyId: "company-a" } } }))
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled()
    expect(mocks.recurring).not.toHaveBeenCalled()
  })

  it("refuses revoked membership even if the session remains connected", async () => {
    mocks.membership.mockResolvedValue({ id: "member-a", role: "OWNER", status: "SUSPENDED", agencyMemberships: [] })
    await expect(getInvoiceById("invoice-a")).rejects.toThrow("plus accès")
    expect(mocks.invoiceFind).not.toHaveBeenCalled()
  })
})
