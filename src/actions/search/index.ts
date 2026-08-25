"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"

export async function globalSearch(query: string) {
  if (!query || query.trim().length < 2) return []

  return withAuth(async ({ companyId }) => {
    const normalized = query.trim().toLowerCase()
    const variants = [...new Set([query.trim(), normalized, normalized.toUpperCase(), normalized.charAt(0).toUpperCase() + normalized.slice(1)])]
    const contains = (field: string) => variants.map((value) => ({ [field]: { contains: value } }))

    const [clients, contacts, leads, invoices, projects, quotes, contracts, tickets, equipments, suppliers, purchases, campaigns] = await Promise.all([
      prisma.client.findMany({ where: { companyId, OR: contains("name") }, take: 5, select: { id: true, name: true } }),
      prisma.contact.findMany({ where: { client: { companyId }, OR: [...contains("firstName"), ...contains("lastName"), ...contains("email"), ...contains("phone")] }, take: 5, select: { id: true, firstName: true, lastName: true, clientId: true, client: { select: { name: true } } } }),
      prisma.leadCapture.findMany({ where: { companyId, OR: [...contains("firstName"), ...contains("lastName"), ...contains("email"), ...contains("projectType")] }, take: 5, select: { id: true, firstName: true, lastName: true, projectType: true } }),
      prisma.invoice.findMany({ where: { companyId, OR: [...contains("number"), ...contains("object")] }, take: 5, select: { id: true, number: true, object: true } }),
      prisma.project.findMany({ where: { companyId, OR: contains("name") }, take: 5, select: { id: true, name: true } }),
      prisma.quote.findMany({ where: { companyId, OR: [...contains("number"), ...contains("object")] }, take: 5, select: { id: true, number: true, object: true } }),
      prisma.contract.findMany({ where: { companyId, OR: [...contains("number"), ...contains("title")] }, take: 5, select: { id: true, number: true, title: true } }),
      prisma.serviceTicket.findMany({ where: { companyId, OR: [...contains("number"), ...contains("title"), ...contains("description")] }, take: 5, select: { id: true, number: true, title: true } }),
      prisma.equipment.findMany({ where: { companyId, OR: [...contains("label"), ...contains("manufacturer"), ...contains("model"), ...contains("serialNumber")] }, take: 5, select: { id: true, label: true, serialNumber: true } }),
      prisma.supplier.findMany({ where: { companyId, OR: [...contains("name"), ...contains("code"), ...contains("contactName")] }, take: 5, select: { id: true, name: true, code: true } }),
      prisma.purchaseOrder.findMany({ where: { companyId, OR: [...contains("number"), ...contains("supplierReference")] }, take: 5, select: { id: true, number: true, supplier: { select: { name: true } } } }),
      prisma.marketingCampaign.findMany({ where: { companyId, OR: [...contains("name"), ...contains("objective"), ...contains("utmCampaign")] }, take: 5, select: { id: true, name: true, status: true } }),
    ])

    return [
      ...clients.map((client) => ({ id: client.id, label: client.name, type: "Client", href: `/dashboard/clients/${client.id}` })),
      ...contacts.map((contact) => ({ id: contact.id, label: `${contact.firstName} ${contact.lastName} — ${contact.client.name}`, type: "Contact", href: `/dashboard/clients/${contact.clientId}` })),
      ...leads.map((lead) => ({ id: lead.id, label: `${lead.firstName} ${lead.lastName}${lead.projectType ? ` — ${lead.projectType}` : ""}`, type: "Prospect", href: `/dashboard/leads#lead-${lead.id}` })),
      ...projects.map((project) => ({ id: project.id, label: project.name, type: "Projet", href: `/dashboard/projets/${project.id}` })),
      ...quotes.map((quote) => ({ id: quote.id, label: `${quote.number} — ${quote.object}`, type: "Devis", href: `/dashboard/devis/${quote.id}` })),
      ...invoices.map((invoice) => ({ id: invoice.id, label: `${invoice.number} — ${invoice.object}`, type: "Facture", href: `/dashboard/factures/${invoice.id}` })),
      ...contracts.map((contract) => ({ id: contract.id, label: `${contract.number} — ${contract.title}`, type: "Contrat", href: `/dashboard/contrats/${contract.id}` })),
      ...tickets.map((ticket) => ({ id: ticket.id, label: `${ticket.number} — ${ticket.title}`, type: "Ticket", href: "/dashboard/operations?tab=sav" })),
      ...equipments.map((equipment) => ({ id: equipment.id, label: `${equipment.label}${equipment.serialNumber ? ` — ${equipment.serialNumber}` : ""}`, type: "Équipement", href: "/dashboard/operations?tab=assets" })),
      ...suppliers.map((supplier) => ({ id: supplier.id, label: `${supplier.name}${supplier.code ? ` — ${supplier.code}` : ""}`, type: "Fournisseur", href: "/dashboard/operations?tab=stock" })),
      ...purchases.map((purchase) => ({ id: purchase.id, label: `${purchase.number} — ${purchase.supplier.name}`, type: "Achat", href: "/dashboard/operations?tab=stock" })),
      ...campaigns.map((campaign) => ({ id: campaign.id, label: `${campaign.name} — ${campaign.status}`, type: "Campagne", href: `/dashboard/campagnes#campaign-${campaign.id}` })),
    ].slice(0, 40)
  }, "crm.read")
}
