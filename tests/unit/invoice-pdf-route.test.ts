import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), pdf: vi.fn(), embed: vi.fn(), xml: vi.fn(), audit: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/route-auth", () => ({ withRouteAuth: mocks.auth }))
vi.mock("@/lib/prisma", () => ({ default: { invoice: { findFirst: mocks.find } } }))
vi.mock("@/lib/pdf/generator", () => ({ generatePdfFromHtml: mocks.pdf, embedFacturX: mocks.embed }))
vi.mock("@/lib/pdf/facturx", () => ({ generateFacturX: mocks.xml }))
vi.mock("@/lib/pdf/render", () => ({ parsePdfRenderOptions: () => ({}), renderDocumentHtml: () => "<html>Preview</html>" }))
vi.mock("@/lib/audit", () => ({ logAction: mocks.audit }))
vi.mock("@/lib/crypto", () => ({ decryptSensitive: () => null }))

import { GET } from "@/app/api/pdf/facture/[id]/route"

const request = () => GET(new Request("https://app.example.test/api/pdf/facture/invoice-1"), { params: Promise.resolve({ id: "invoice-1" }) })

describe("invoice PDF HTTP response", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockImplementation((_permission, action) => action({ userId: "user-a", companyId: "company-a" }))
    mocks.find.mockResolvedValue({ id: "invoice-1", number: "F-2026-1", date: new Date(), lines: [], client: {}, company: {} })
    mocks.pdf.mockResolvedValue(Buffer.from("plain-pdf"))
    mocks.xml.mockReturnValue("<xml/>")
    mocks.embed.mockResolvedValue(Buffer.from("structured-pdf"))
  })

  it("returns no PDF and no success audit when XML embedding fails", async () => {
    mocks.embed.mockRejectedValue(new Error("private internal failure"))
    const response = await request()
    expect(response.status).toBe(500)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(await response.text()).not.toContain("private internal failure")
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it("does not silently fall back when XML generation fails", async () => {
    mocks.xml.mockImplementation(() => { throw new Error("Invalid totals") })
    expect((await request()).status).toBe(500)
    expect(mocks.embed).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it("returns the structured bytes only after successful assembly", async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("structured-pdf")
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "invoice-1", companyId: "company-a" } }))
    expect(mocks.auth).toHaveBeenCalledWith("finance.read", expect.any(Function))
    expect(mocks.audit).toHaveBeenCalledTimes(1)
  })
})
