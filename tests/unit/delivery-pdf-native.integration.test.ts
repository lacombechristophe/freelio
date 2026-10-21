import { createHash, randomUUID } from "node:crypto"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib"
import puppeteer from "puppeteer"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "", authenticated: true }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => session.authenticated ? { user: { id: session.userId }, companyId: session.companyId } : null }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import prisma from "@/lib/prisma"
import { createDeliveryNote, signDeliveryNote } from "@/actions/operations"
import { GET } from "@/app/api/pdf/livraison/[id]/route"

const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex")
const artifacts: Array<{ file: string; sha256: string; bytes: number; pages: number; fonts: string[]; embeddedFiles: number; embeddedGlyphFonts: number }> = []

describe.sequential("Delivery documents with real bundled fonts and Chromium", () => {
  let directory: string, clientId: string, projectId: string, sequence = 0
  beforeAll(async () => {
    const executable = await puppeteer.executablePath()
    expect(existsSync(executable), "Existing Puppeteer Chromium is required for native PDF qualification").toBe(true)
    directory = mkdtempSync(path.join(tmpdir(), "Freelio-delivery-native-"))
    session.companyId = (await prisma.company.create({ data: { name: "Atelier Élodie — Démonstration", address: "12 rue des Ateliers fictifs, 75011 Paris", email: "atelier@example.test", serviceTimezone: "Europe/Paris" } })).id
    session.userId = (await prisma.user.create({ data: { email: `native-delivery-${randomUUID()}@example.test` } })).id
    await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Müller & Fils — Données fictives", address: "8 allée des Essais, 69003 Lyon" } })).id
    const site = await prisma.customerSite.create({ data: { companyId: session.companyId, clientId, label: "Bâtiment Łódź fictif", address1: "8 allée des Essais", postalCode: "69003", city: "Lyon" } })
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, siteId: site.id, name: "Chantier fictif de qualification PDF" } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks(); session.authenticated = true
    if (!session.companyId) return
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.deliveryNote.deleteMany({ where: { companyId: session.companyId } })
    await prisma.customerOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.update({ where: { id: session.companyId }, data: { name: "Atelier Élodie — Démonstration" } })
    await prisma.client.update({ where: { id: clientId }, data: { name: "Müller & Fils — Données fictives" } })
  })
  afterAll(async () => {
    if (!session.companyId) return
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.customerSite.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
    const receipt = { directory, artifacts, scope: "Real SQL/actions/route/fonts/PDF engine; session/cache mocked; no application server or Playwright" }
    if (process.env.PDF_NATIVE_RECEIPT) writeFileSync(process.env.PDF_NATIVE_RECEIPT, JSON.stringify(receipt, null, 2) + "\n")
    console.info("PDF_NATIVE_ARTIFACTS", JSON.stringify(receipt))
  })
  const request = (id: string, screen = false) => GET(new Request(`https://example.test/api/pdf/livraison/${id}${screen ? "?screen=1" : ""}`), { params: Promise.resolve({ id }) })
  async function seed(lines = 1) {
    const number = `BL-FICTIF-${String(++sequence).padStart(3, "0")}`
    const order = await prisma.customerOrder.create({ data: { companyId: session.companyId, clientId, projectId, number: `CMD-${number}`, status: "CONFIRMED",
      lines: { create: Array.from({ length: lines }, (_, index) => ({ label: `${String(index + 1).padStart(3, "0")} — Pièce d’essai & raccord <fictif>`, quantity: index ? 1 : 0.0001, unitPriceCents: 100, order: index })) },
    }, include: { lines: { orderBy: { order: "asc" } } } })
    if (lines === 1) {
      const created = await createDeliveryNote({ customerOrderId: order.id, customerOrderLineId: order.lines[0].id, quantity: 0.0001, notes: "Données fictives — qualification hors ligne." })
      return prisma.deliveryNote.findUniqueOrThrow({ where: { id: created.id } })
    }
    // Multi-line historical/imported records are seeded explicitly; this does not
    // claim that the one-line composer implements batch delivery.
    await prisma.customerOrderLine.updateMany({ where: { customerOrderId: order.id }, data: { deliveredQuantity: 1 } })
    await prisma.customerOrderLine.update({ where: { id: order.lines[0].id }, data: { deliveredQuantity: 0.0001 } })
    return prisma.deliveryNote.create({ data: { companyId: session.companyId, customerOrderId: order.id, projectId, number, status: "DELIVERED", deliveredAt: new Date(), notes: "Données fictives — contrôle des lignes et de la signature sur plusieurs pages.",
      lines: { create: order.lines.map(line => ({ customerOrderLineId: line.id, label: line.label, quantity: line.quantity })) },
    } })
  }
  async function savePdf(id: string, file: string) {
    const response = await request(id)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/pdf")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(Buffer.from(bytes).subarray(0, 4).toString("ascii")).toBe("%PDF")
    const pdf = await PDFDocument.load(bytes), fonts: string[] = []
    let embedded = 0, embeddedGlyphFonts = 0
    for (const [, object] of pdf.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFDict)) continue
      for (const key of ["FontFile2", "FontFile3"]) {
        const reference = object.get(PDFName.of(key))
        if (reference && pdf.context.lookup(reference) instanceof PDFRawStream) {
          embedded++
          const name = object.get(PDFName.of("FontName"))
          if (name instanceof PDFName) fonts.push(name.decodeText())
        }
      }
      // Chromium can embed variable fonts as Type 3 glyph programs rather than
      // FontFile streams. Require their programs and Unicode map, not just names.
      if (object.get(PDFName.of("Subtype")) === PDFName.of("Type3")) {
        const programs = pdf.context.lookup(object.get(PDFName.of("CharProcs")))
        expect(programs).toBeInstanceOf(PDFDict)
        if (!(programs instanceof PDFDict)) throw new Error("Missing embedded glyph programs")
        expect(programs.keys().length).toBeGreaterThan(0)
        for (const [, program] of programs.entries()) expect(pdf.context.lookup(program)).toBeInstanceOf(PDFRawStream)
        expect(pdf.context.lookup(object.get(PDFName.of("ToUnicode")))).toBeInstanceOf(PDFRawStream)
        const descriptor = pdf.context.lookup(object.get(PDFName.of("FontDescriptor")))
        expect(descriptor).toBeInstanceOf(PDFDict)
        const name = descriptor instanceof PDFDict ? descriptor.get(PDFName.of("FontName")) : undefined
        expect(name).toBeInstanceOf(PDFName)
        if (name instanceof PDFName) fonts.push(name.decodeText())
        embeddedGlyphFonts++
      }
    }
    const metadata = { file, sha256: sha(bytes), bytes: bytes.length, pages: pdf.getPageCount(), fonts, embeddedFiles: embedded, embeddedGlyphFonts }
    writeFileSync(path.join(directory, file), bytes); artifacts.push(metadata)
    const embeddedNames = fonts.map(name => name.replace(/[^a-z0-9]/gi, ""))
    expect(embeddedNames.some(name => name.includes("SourceSans3"))).toBe(true)
    expect(embeddedNames.some(name => name.includes("SourceSerif4"))).toBe(true)
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeGreaterThan(594); expect(page.getWidth()).toBeLessThan(598)
      expect(page.getHeight()).toBeGreaterThan(840); expect(page.getHeight()).toBeLessThan(845)
    }
    return metadata
  }
  it("captures real fonts and renders the same signed content after identity and line edits", async () => {
    const note = await seed()
    await signDeliveryNote({ deliveryNoteId: note.id, recipientName: "Zoé Łukasz — réception fictive", customerApproval: true })
    const original = await (await request(note.id, true)).text()
    expect(original).toContain("data:font/woff2;base64,")
    expect(original).not.toContain('src: url("/fonts/')
    expect(original).toContain("0,0001"); expect(original).toContain("&lt;fictif&gt;")
    writeFileSync(path.join(directory, "signed-capture.html"), original)
    const first = await savePdf(note.id, "signed-original.pdf")
    expect(first.pages).toBe(1)
    await prisma.company.update({ where: { id: session.companyId }, data: { name: "Identité modifiée après signature" } })
    await prisma.client.update({ where: { id: clientId }, data: { name: "Client modifié après signature" } })
    await prisma.deliveryNoteLine.updateMany({ where: { deliveryNoteId: note.id }, data: { label: "Ligne modifiée après signature", quantity: 99 } })
    expect(await (await request(note.id, true)).text()).toBe(original)
    const second = await savePdf(note.id, "signed-after-edits.pdf")
    expect(second.pages).toBe(first.pages)
  }, 30_000)
  it("renders a signed multi-page delivery with its complete captured line list", async () => {
    const note = await seed(80)
    await signDeliveryNote({ deliveryNoteId: note.id, recipientName: "Zoé Łukasz — réception fictive", customerApproval: true })
    const html = await (await request(note.id, true)).text()
    writeFileSync(path.join(directory, "signed-multi-page.html"), html)
    for (let index = 1; index <= 80; index++) expect(html).toContain(`${String(index).padStart(3, "0")} — Pièce`)
    expect((await savePdf(note.id, "signed-multi-page.pdf")).pages).toBeGreaterThan(1)
  }, 30_000)
  it("does not launch Chromium for an unauthenticated request or a missing historical capture", async () => {
    const note = await seed(), launch = vi.spyOn(puppeteer, "launch")
    session.authenticated = false
    expect((await request(note.id)).status).toBe(401)
    session.authenticated = true
    await prisma.deliveryNote.update({ where: { id: note.id }, data: { status: "SIGNED", signedAt: new Date(), signatureSha256: "a".repeat(64) } })
    const historical = await request(note.id)
    expect(historical.status).toBe(409)
    expect(await historical.json()).toMatchObject({ error: "Archive historique indisponible" })
    expect(launch).not.toHaveBeenCalled()
    expect(await prisma.auditLog.count({ where: { userId: session.userId, action: "GENERATE_PDF" } })).toBe(0)
  })
})
