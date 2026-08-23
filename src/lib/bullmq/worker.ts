import { createHash } from "node:crypto"
import { Job, Worker } from "bullmq"
import prisma from "@/lib/prisma"
import { embedFacturX, generatePdfFromHtml } from "@/lib/pdf/generator"
import { generateFacturX } from "@/lib/pdf/facturx"
import { renderDocumentHtml, type PdfDocument } from "@/lib/pdf/render"

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number.parseInt(process.env.REDIS_PORT || "6379", 10),
}

type DocGenJob = {
  type: "QUOTE" | "INVOICE"
  id: string
  version?: number
}

function pdfCompany(company: {
  name: string
  fullName: string | null
  address: string | null
  email: string | null
  phone: string | null
  logo: string | null
  siret: string | null
  tvaNumber: string | null
  apeCode: string | null
  rcsNumber: string | null
  iban: string | null
  isTvaApplicable: boolean
  latePenaltyRate: number
  brandColor: string
  pdfTemplate: string
}): PdfDocument["company"] {
  return {
    name: company.name,
    fullName: company.fullName,
    address: company.address,
    email: company.email,
    phone: company.phone,
    logo: company.logo,
    siret: company.siret,
    tvaNumber: company.tvaNumber,
    apeCode: company.apeCode,
    rcsNumber: company.rcsNumber,
    iban: company.iban,
    isTvaApplicable: company.isTvaApplicable,
    latePenaltyRate: company.latePenaltyRate,
    brandColor: company.brandColor,
    pdfTemplate: company.pdfTemplate,
  }
}

async function generateQuote(job: Job<DocGenJob>) {
  const quote = await prisma.quote.findUnique({
    where: { id: job.data.id },
    include: {
      client: true,
      company: true,
      versions: {
        where: job.data.version ? { version: job.data.version } : undefined,
        orderBy: { version: "desc" },
        take: 1,
        include: {
          sections: {
            orderBy: { order: "asc" },
            include: { lines: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  })

  if (!quote) throw new Error("QUOTE not found")
  const version = quote.versions[0]
  if (!version) throw new Error("QUOTE version not found")

  const lines = version.sections.flatMap((section) => section.lines)
  const html = renderDocumentHtml(
    {
      kind: "DEVIS",
      number: quote.number,
      object: quote.object,
      date: quote.date,
      validUntil: quote.validUntil,
      totalHtCents: version.totalHtCents,
      totalTvaCents: version.totalTvaCents,
      totalTtcCents: version.totalTtcCents,
      lines: lines.map((line) => ({
        label: line.label,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        tvaRate: line.tvaRate,
      })),
      client: {
        name: quote.client.name,
        address: quote.client.address,
        siret: quote.client.siret,
        tvaNumber: quote.client.tvaNumber,
      },
      company: pdfCompany(quote.company),
    },
    { template: quote.company.pdfTemplate }
  )

  const pdfBuffer = await generatePdfFromHtml(html)
  const hash = createHash("sha256").update(pdfBuffer).digest("hex")
  const pdfUrl = `https://storage.freelio.fr/quotes/${quote.number}.pdf`

  await prisma.quote.update({
    where: { id: quote.id },
    data: { status: "SENT" },
  })

  return { success: true, hash, pdfUrl }
}

async function generateInvoice(job: Job<DocGenJob>) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: job.data.id },
    include: {
      client: true,
      company: true,
      lines: { orderBy: { order: "asc" } },
    },
  })

  if (!invoice) throw new Error("INVOICE not found")

  const html = renderDocumentHtml(
    {
      kind: "FACTURE",
      number: invoice.number,
      object: invoice.object,
      date: invoice.date,
      dueDate: invoice.dueDate,
      totalHtCents: invoice.totalHtCents,
      totalTvaCents: invoice.totalTvaCents,
      totalTtcCents: invoice.totalTtcCents,
      lines: invoice.lines.map((line) => ({
        label: line.label,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        tvaRate: line.tvaRate,
      })),
      client: {
        name: invoice.client.name,
        address: invoice.client.address,
        siret: invoice.client.siret,
        tvaNumber: invoice.client.tvaNumber,
      },
      company: pdfCompany(invoice.company),
    },
    { template: invoice.company.pdfTemplate }
  )

  let pdfBuffer = await generatePdfFromHtml(html)
  const xml = generateFacturX({
    number: invoice.number,
    date: invoice.date.toISOString().split("T")[0],
    seller: {
      name: invoice.company.name,
      siret: invoice.company.siret || "",
      address: invoice.company.address || "",
      vatNumber: invoice.company.tvaNumber || undefined,
    },
    buyer: {
      name: invoice.client.name,
      siret: invoice.client.siret || undefined,
      address: invoice.client.address || "",
      vatNumber: invoice.client.tvaNumber || undefined,
    },
    lines: invoice.lines.map((line) => ({
      label: line.label,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      totalHtCents: Math.round(line.quantity * line.unitPriceCents),
      tvaRate: line.tvaRate,
    })),
    totalHtCents: invoice.totalHtCents,
    totalTvaCents: invoice.totalTvaCents,
    totalTtcCents: invoice.totalTtcCents,
  })

  pdfBuffer = await embedFacturX(Buffer.from(pdfBuffer), xml)
  const hash = createHash("sha256").update(pdfBuffer).digest("hex")
  const pdfUrl = `https://storage.freelio.fr/invoices/${invoice.number}.pdf`

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { pdfUrl, pdfHash: hash, status: "SENT" },
  })

  return { success: true, hash, pdfUrl }
}

export const docGenWorker = new Worker<DocGenJob>(
  "DOC_GEN",
  async (job) => (job.data.type === "QUOTE" ? generateQuote(job) : generateInvoice(job)),
  { connection }
)

docGenWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed successfully`)
})

docGenWorker.on("failed", (job, error) => {
  console.error(`Job ${job?.id} failed with error: ${error.message}`)
})
