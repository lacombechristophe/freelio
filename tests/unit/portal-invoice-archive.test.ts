import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ access: vi.fn(), invoice: vi.fn(), archive: vi.fn(), render: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ default: { invoice: { findFirst: mocks.invoice } } }))
vi.mock("@/lib/portal/session", () => ({ getCurrentPortalAccess: mocks.access }))
vi.mock("@/lib/finance/issued-invoice", () => ({ readIssuedInvoice: mocks.archive }))
vi.mock("@/lib/pdf/generator", () => ({ generatePdfFromHtml: mocks.render }))
import { GET } from "@/app/api/portal/documents/[kind]/[id]/route"
const request = () => GET(new Request("https://example.test/api/portal/documents/invoice/i1"), { params: Promise.resolve({ kind: "invoice", id: "i1" }) })
beforeEach(() => { vi.resetAllMocks(); mocks.access.mockResolvedValue({ companyId: "c1", clientId: "buyer1" }); mocks.invoice.mockResolvedValue({ id: "i1", number: "SYNTHETIC-1" }); mocks.archive.mockResolvedValue({ pdf: Buffer.from("%PDF-canonical-synthetic") }) })
it("serves canonical bytes after querying within the portal company and client", async () => {
  const response = await request()
  expect(response.status).toBe(200)
  expect(await response.text()).toBe("%PDF-canonical-synthetic")
  expect(mocks.invoice).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: "c1", clientId: "buyer1" }) }))
  expect(mocks.render).not.toHaveBeenCalled()
})
it("does not regenerate a missing archive", async () => {
  mocks.archive.mockRejectedValue(new Error("Synthetic missing archive"))
  expect((await request()).status).toBe(409)
  expect(mocks.render).not.toHaveBeenCalled()
})
it("does not expose an invoice absent from the portal's scope", async () => {
  mocks.invoice.mockResolvedValue(null)
  expect((await request()).status).toBe(404)
  expect(mocks.archive).not.toHaveBeenCalled()
})
