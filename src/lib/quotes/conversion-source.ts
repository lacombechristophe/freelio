import "server-only"

import { createHash } from "node:crypto"
import type { Prisma } from "@/generated/prisma/client"

export type QuoteConversionSource = Prisma.QuoteGetPayload<{ include: { versions: { include: { sections: { include: { lines: true } } } } } }>

function versions(quote: QuoteConversionSource) {
  return [...quote.versions].sort((a, b) => b.version - a.version || a.id.localeCompare(b.id)).map(version => ({
    id: version.id, version: version.version, totalHtCents: version.totalHtCents, totalTvaCents: version.totalTvaCents, totalTtcCents: version.totalTtcCents,
    sections: [...version.sections].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(section => ({
      id: section.id, title: section.title, order: section.order,
      lines: [...section.lines].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(line => ({
        id: line.id, productId: line.productId, label: line.label, description: line.description,
        quantity: line.quantity, unitPriceCents: line.unitPriceCents, tvaRate: line.tvaRate, order: line.order,
      })),
    })),
  }))
}

export function quoteOrderRevision(quote: QuoteConversionSource) {
  return createHash("sha256").update(JSON.stringify({
    id: quote.id, companyId: quote.companyId, clientId: quote.clientId, projectId: quote.projectId,
    number: quote.number, object: quote.object, status: quote.status, acceptedAt: quote.acceptedAt,
    currentVersion: quote.currentVersion, updatedAt: quote.updatedAt,
    versions: versions(quote),
  })).digest("hex")
}

export function quoteContractRevision(quote: QuoteConversionSource) {
  // Linking the operational project does not change the proposed contract.
  return createHash("sha256").update(JSON.stringify({
    kind: "quote-contract-v1", id: quote.id, companyId: quote.companyId, clientId: quote.clientId,
    number: quote.number, object: quote.object, status: quote.status, acceptedAt: quote.acceptedAt,
    validUntil: quote.validUntil, currentVersion: quote.currentVersion, versions: versions(quote),
  })).digest("hex")
}
