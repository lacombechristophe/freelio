import { afterAll, beforeAll, expect, it, vi } from "vitest"
import puppeteer from "puppeteer"
import { existsSync } from "node:fs"
const identity = vi.hoisted(() => ({ companyId: "", userId: "" }))
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: identity.userId }, companyId: identity.companyId })) }))
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { updateInvoiceStatus } from "@/actions/factures"
import { readIssuedInvoice } from "@/lib/finance/issued-invoice"
import { removeLocalFile } from "@/lib/local-files"
const available = existsSync(await puppeteer.executablePath())
let invoiceId = ""
let artifact: string | null = null
beforeAll(async () => {
  if (!available) return
  const company = await prisma.company.create({ data: { name: "Synthetic invoice issuer", siret: "12345678900012", tvaNumber: "FR00123456789", address: "1 rue Fictive, 44000 Nantes" } })
  const user = await prisma.user.create({ data: { email: company.id + "@example.test", companyId: company.id } })
  identity.companyId = company.id; identity.userId = user.id
  await prisma.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } })
  const client = await prisma.client.create({ data: { companyId: company.id, name: "Synthetic invoice buyer", address: "2 rue Fictive, 44000 Nantes" } })
  const invoice = await prisma.invoice.create({ data: { companyId: company.id, clientId: client.id, number: "SYNTHETIC-2026-001", object: "Recette fictive", dueDate: new Date("2026-10-30"), totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000, lines: { create: { label: "Synthetic service", quantity: 1, unitPriceCents: 10000, tvaRate: 20 } } } })
  invoiceId = invoice.id
})
afterAll(async () => {
  if (!available) return
  if (artifact) await removeLocalFile(artifact)
  await prisma.invoice.deleteMany({ where: { companyId: identity.companyId } })
  await prisma.client.deleteMany({ where: { companyId: identity.companyId } })
  await prisma.user.update({ where: { id: identity.userId }, data: { companyId: null } })
  await prisma.membership.deleteMany({ where: { companyId: identity.companyId } })
  await prisma.auditLog.deleteMany({ where: { userId: identity.userId } })
  await prisma.company.delete({ where: { id: identity.companyId } })
  await prisma.user.delete({ where: { id: identity.userId } })
})
it.skipIf(!available)("persists real PDF/XML at issuance and preserves it after identity changes", async () => {
  const issued = await updateInvoiceStatus(invoiceId, "SENT")
  artifact = issued.pdfUrl
  expect(issued.issuedDocument).toMatch(/^v1:/)
  const before = await readIssuedInvoice(issued)
  await prisma.company.update({ where: { id: identity.companyId }, data: { name: "Changed synthetic issuer" } })
  await prisma.client.update({ where: { id: issued.clientId }, data: { name: "Changed synthetic buyer" } })
  const after = await readIssuedInvoice(await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } }))
  expect(after.pdf).toEqual(before.pdf)
  expect(after.xml).toBe(before.xml)
  expect(after.html).toContain("Synthetic invoice issuer")
  expect(after.html).not.toContain("Changed synthetic issuer")
}, 30_000)
