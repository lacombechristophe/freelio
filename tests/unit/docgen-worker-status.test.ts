import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  processor: null as null | ((job: { data: { type: "QUOTE" | "INVOICE"; id: string } }) => Promise<unknown>),
  quoteFind: vi.fn(), quoteUpdate: vi.fn(), invoiceFind: vi.fn(), invoiceUpdate: vi.fn(),
  store: vi.fn(), remove: vi.fn(), readArchive: vi.fn(),
}))

vi.mock("bullmq", () => ({
  Worker: class {
    constructor(_name: string, processor: typeof mocks.processor) { mocks.processor = processor }
    on() { return this }
  },
}))
vi.mock("@/lib/prisma", () => ({ default: {
  quote: { findUnique: mocks.quoteFind, update: mocks.quoteUpdate },
  invoice: { findUnique: mocks.invoiceFind, updateMany: mocks.invoiceUpdate },
} }))
vi.mock("@/lib/pdf/generator", () => ({ generatePdfFromHtml: vi.fn(async () => Buffer.from("pdf")), embedFacturX: vi.fn(async () => Buffer.from("factur-x")) }))
vi.mock("@/lib/pdf/facturx", () => ({ generateFacturX: vi.fn(() => "<xml/>") }))
vi.mock("@/lib/pdf/render", () => ({ renderDocumentHtml: vi.fn(() => "<html></html>") }))
vi.mock("@/lib/local-files", () => ({ storeFileBytes: mocks.store, removeLocalFile: mocks.remove }))
vi.mock("@/lib/finance/issued-invoice", () => ({ isIssuedInvoice: (invoice: {status: string}) => invoice.status === "SENT", readIssuedInvoice: mocks.readArchive }))
vi.mock("@/lib/crypto", () => ({ decryptSensitive: vi.fn(() => null) }))

import "@/lib/bullmq/worker"

const company = { name: "Atelier", pdfTemplate: "EDITORIAL", brandColor: "#000000", isTvaApplicable: true, latePenaltyRate: 0 }
const client = { name: "Client" }

describe("document generation worker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.store.mockResolvedValue({ relativePath: "generated/document.pdf" })
    mocks.invoiceUpdate.mockResolvedValue({ count: 1 })
  })

  it("does not mark a quote as sent when it only generates its PDF", async () => {
    mocks.quoteFind.mockResolvedValue({ id: "quote-1", companyId: "company-1", number: "D-1", date: new Date(), company, client, versions: [{ totalHtCents: 100, totalTvaCents: 20, totalTtcCents: 120, sections: [{ lines: [] }] }] })
    if (!mocks.processor) throw new Error("Worker processor not registered")
    await mocks.processor({ data: { type: "QUOTE", id: "quote-1" } })
    expect(mocks.quoteUpdate).not.toHaveBeenCalled()
  })

  it("stores an invoice PDF without changing the invoice's sending status", async () => {
    mocks.invoiceFind.mockResolvedValue({ id: "invoice-1", companyId: "company-1", number: "F-1", date: new Date(), company, client, lines: [], totalHtCents: 100, totalTvaCents: 20, totalTtcCents: 120 })
    if (!mocks.processor) throw new Error("Worker processor not registered")
    await mocks.processor({ data: { type: "INVOICE", id: "invoice-1" } })
    expect(mocks.invoiceUpdate).toHaveBeenCalledWith({ where: { id: "invoice-1", status: "DRAFT", lockedAt: null, updatedAt: undefined }, data: { pdfUrl: "generated/document.pdf", pdfHash: expect.any(String) } })
  })

  it("preserves the archive if issuance races with generation, and removes the obsolete draft artifact", async () => {
    mocks.invoiceFind.mockResolvedValueOnce({ id: "invoice-1", companyId: "company-1", status: "DRAFT", updatedAt: new Date(), number: "F-1", date: new Date(), company, client, lines: [], totalHtCents: 100, totalTvaCents: 20, totalTtcCents: 120 })
      .mockResolvedValueOnce({ id: "invoice-1", status: "SENT", pdfHash: "issued-hash", pdfUrl: "issued.pdf" })
    mocks.invoiceUpdate.mockResolvedValue({ count: 0 })
    if (!mocks.processor) throw new Error("Worker processor not registered")
    await expect(mocks.processor({ data: { type: "INVOICE", id: "invoice-1" } })).resolves.toMatchObject({ hash: "issued-hash", pdfUrl: "issued.pdf" })
    expect(mocks.remove).toHaveBeenCalledWith("generated/document.pdf")
    expect(mocks.readArchive).toHaveBeenCalledOnce()
  })
})
