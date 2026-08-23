"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { calculateLineTotal, calculateTva } from "@/lib/billing"
import { revalidatePath } from "next/cache"
import { enqueueDocGen } from "@/lib/bullmq/queue"

export async function createQuote(data: {
  clientId: string
  projectId?: string
  object: string
  lines: Array<{
    label: string
    quantity: number
    unitPriceCents: number
    tvaRate: number
  }>
}) {
  return await withAuth(async ({ userId, companyId }) => {
    // 1. Calculate totals
    let totalHtCents = 0
    let totalTvaCents = 0

    data.lines.forEach(line => {
      const lineTotal = calculateLineTotal(line.quantity, line.unitPriceCents)
      totalHtCents += lineTotal
      totalTvaCents += calculateTva(lineTotal, line.tvaRate)
    })

    const totalTtcCents = totalHtCents + totalTvaCents

    // 2. Transactional creation
    const quote = await (prisma as any).$transaction(async (tx: any) => {
      // Find numbering
      const count = await tx.quote.count({ where: { companyId } })
      const year = new Date().getFullYear()
      const number = `DEV-${year}-${(count + 1).toString().padStart(3, '0')}`

      const q = await tx.quote.create({
        data: {
          companyId,
          clientId: data.clientId,
          projectId: data.projectId,
          number,
          object: data.object,
          status: "DRAFT",
          versions: {
            create: {
              version: 1,
              totalHtCents,
              totalTvaCents,
              totalTtcCents,
              sections: {
                create: {
                  title: "Prestations",
                  lines: {
                    create: data.lines.map((line, idx) => ({
                      label: line.label,
                      quantity: line.quantity,
                      unitPriceCents: line.unitPriceCents,
                      tvaRate: line.tvaRate,
                      order: idx
                    }))
                  }
                }
              }
            }
          }
        }
      })
      return q
    })

    await logAction({
      userId,
      action: "CREATE_QUOTE",
      resource: "QUOTE",
      resourceId: quote.id,
      payload: { number: quote.number }
    })

    revalidatePath("/dashboard/devis")
    return quote
  })
}

export async function createInvoice(data: {
  clientId: string
  projectId?: string
  object: string
  dueDate: Date
  lines: Array<{
    label: string
    quantity: number
    unitPriceCents: number
    tvaRate: number
  }>
}) {
  return await withAuth(async ({ userId, companyId }) => {
    // 1. Calculate totals
    let totalHtCents = 0
    let totalTvaCents = 0

    data.lines.forEach(line => {
      const lineTotal = calculateLineTotal(line.quantity, line.unitPriceCents)
      totalHtCents += lineTotal
      totalTvaCents += calculateTva(lineTotal, line.tvaRate)
    })

    const totalTtcCents = totalHtCents + totalTvaCents

    // 2. Transactional creation
    const invoice = await (prisma as any).$transaction(async (tx: any) => {
      const count = await tx.invoice.count({ where: { companyId } })
      const year = new Date().getFullYear()
      const number = `FACT-${year}-${(count + 1).toString().padStart(3, '0')}`

      return await tx.invoice.create({
        data: {
          companyId,
          clientId: data.clientId,
          projectId: data.projectId,
          number,
          object: data.object,
          status: "DRAFT",
          dueDate: data.dueDate,
          totalHtCents,
          totalTvaCents,
          totalTtcCents,
          lines: {
            create: data.lines.map((line, idx) => ({
              label: line.label,
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents,
              tvaRate: line.tvaRate,
              order: idx
            }))
          }
        }
      })
    })

    await logAction({
      userId,
      action: "CREATE_INVOICE",
      resource: "INVOICE",
      resourceId: invoice.id,
      payload: { number: invoice.number }
    })

    // Enqueue PDF & Factur-X Generation
    await enqueueDocGen("INVOICE", invoice.id)

    revalidatePath("/dashboard/factures")
    return invoice
  })
}
