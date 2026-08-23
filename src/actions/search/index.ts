"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"

// SQLite ne supporte pas `mode: "insensitive"` — on lowercase manuellement.
export async function globalSearch(query: string) {
  if (!query || query.length < 2) return []

  return await withAuth(async ({ companyId }) => {
    const q = query.toLowerCase()

    const [clients, invoices, projects, quotes, contracts] = await Promise.all([
      prisma.client.findMany({
        where: { companyId, name: { contains: q } },
        take: 5,
        select: { id: true, name: true },
      }),
      prisma.invoice.findMany({
        where: {
          companyId,
          OR: [
            { number: { contains: q } },
            { object: { contains: q } },
          ],
        },
        take: 5,
        select: { id: true, number: true, object: true },
      }),
      prisma.project.findMany({
        where: { companyId, name: { contains: q } },
        take: 5,
        select: { id: true, name: true },
      }),
      prisma.quote.findMany({
        where: {
          companyId,
          OR: [
            { number: { contains: q } },
            { object: { contains: q } },
          ],
        },
        take: 5,
        select: { id: true, number: true, object: true },
      }),
      prisma.contract.findMany({
        where: {
          companyId,
          OR: [
            { number: { contains: q } },
            { title: { contains: q } },
          ],
        },
        take: 5,
        select: { id: true, number: true, title: true },
      }),
    ])

    return [
      ...clients.map((c) => ({ id: c.id, label: c.name, type: "Client", href: `/dashboard/clients/${c.id}` })),
      ...projects.map((p) => ({ id: p.id, label: p.name, type: "Projet", href: `/dashboard/projets/${p.id}` })),
      ...quotes.map((q) => ({ id: q.id, label: `${q.number} — ${q.object}`, type: "Devis", href: `/dashboard/devis/${q.id}` })),
      ...invoices.map((i) => ({ id: i.id, label: `${i.number} — ${i.object}`, type: "Facture", href: `/dashboard/factures/${i.id}` })),
      ...contracts.map((c) => ({ id: c.id, label: `${c.number} — ${c.title}`, type: "Contrat", href: `/dashboard/contrats/${c.id}` })),
    ]
  })
}
