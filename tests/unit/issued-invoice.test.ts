import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ render: vi.fn(), xml: vi.fn(), pdf: vi.fn(), embed: vi.fn(), store: vi.fn(), read: vi.fn(), remove: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/pdf/render", () => ({ renderDocumentHtml: mocks.render, parsePdfRenderOptions: () => ({}) }))
vi.mock("@/lib/pdf/generator", () => ({ generatePdfFromHtml: mocks.pdf, embedFacturX: mocks.embed }))
vi.mock("@/lib/pdf/facturx", () => ({ generateFacturX: mocks.xml }))
vi.mock("@/lib/local-files", () => ({ storeFileBytes: mocks.store, readLocalFile: mocks.read, removeLocalFile: mocks.remove }))
vi.mock("@/lib/crypto", () => ({ encrypt: (s: string) => "sealed:" + s, decrypt: (s: string) => s.slice(7), decryptSensitive: () => null }))
import { prepareIssuedInvoice, readIssuedInvoice } from "@/lib/finance/issued-invoice"

describe("Issued invoice canonical document", () => {
  const pdf = Buffer.from("%PDF-1.7 sealed-document")
  const invoice = () => ({
    id: "invoice-a", companyId: "company-a", status: "SENT", lockedAt: new Date(),
    number: "FACT-2026-001", date: new Date("2026-09-30"), dueDate: new Date("2026-10-30"),
    company: { name: "Original seller" }, client: { name: "Original buyer" }, lines: [],
  }) as unknown as Parameters<typeof prepareIssuedInvoice>[0]
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.render.mockImplementation((data) => "<html>" + data.company.name + "/" + data.client.name + "</html>")
    mocks.xml.mockReturnValue("<xml>original</xml>")
    mocks.pdf.mockResolvedValue(pdf)
    mocks.embed.mockResolvedValue(pdf)
    mocks.read.mockResolvedValue(pdf)
    mocks.store.mockResolvedValue({ relativePath: "local:company-a/generated/invoice-a/archive.pdf", sha256: createHash("sha256").update(pdf).digest("hex") })
  })
  it("keeps exact bytes and identities after the current profiles change", async () => {
    const current = invoice()
    const artifact = await prepareIssuedInvoice(current)
    current.company.name = "Changed seller"
    current.client.name = "Changed buyer"
    const archived = await readIssuedInvoice({ ...current, ...artifact })
    expect(archived.html).toContain("Original seller/Original buyer")
    expect(archived.html).not.toContain("Changed")
    expect(archived.pdf).toEqual(pdf)
    expect(mocks.render).toHaveBeenCalledTimes(1)
    expect(mocks.pdf).toHaveBeenCalledTimes(1)
  })
  it("rejects missing archives rather than silently regenerating an issued invoice", async () => {
    await expect(readIssuedInvoice({ ...invoice(), issuedDocument: null, pdfUrl: null, pdfHash: null })).rejects.toThrow("ARCHIVE_MISSING")
    expect(mocks.pdf).not.toHaveBeenCalled()
  })
  it("refuses modified bytes and references outside the tenant/invoice", async () => {
    const current = invoice()
    const artifact = await prepareIssuedInvoice(current)
    mocks.read.mockResolvedValue(Buffer.from("altered"))
    await expect(readIssuedInvoice({ ...current, ...artifact })).rejects.toThrow("INTEGRITY")
    mocks.read.mockClear()
    await expect(readIssuedInvoice({ ...current, ...artifact, pdfUrl: "local:company-b/generated/invoice-a/other.pdf" })).rejects.toThrow("SCOPE")
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it("does not store a document if structured assembly fails", async () => {
    mocks.embed.mockRejectedValue(new Error("assembly failed"))
    await expect(prepareIssuedInvoice(invoice())).rejects.toThrow("assembly failed")
    expect(mocks.store).not.toHaveBeenCalled()
  })
})
