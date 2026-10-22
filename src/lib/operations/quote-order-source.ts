import "server-only"

import { createHash } from "node:crypto"
import type { Prisma } from "@prisma/client"

export type QuoteOrderSource = Prisma.QuoteGetPayload<{ include: { versions: { include: { sections: { include: { lines: true } } } } } }>

export function quoteOrderRevision(quote: QuoteOrderSource) {
  return createHash("sha256").update(JSON.stringify({
    id: quote.id, companyId: quote.companyId, clientId: quote.clientId, projectId: quote.projectId,
    number: quote.number, object: quote.object, status: quote.status, acceptedAt: quote.acceptedAt,
    currentVersion: quote.currentVersion, updatedAt: quote.updatedAt,
    versions: [...quote.versions].sort((a, b) => b.version - a.version || a.id.localeCompare(b.id)).map(version => ({
      id: version.id, version: version.version, totalHtCents: version.totalHtCents, totalTvaCents: version.totalTvaCents, totalTtcCents: version.totalTtcCents,
      sections: [...version.sections].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(section => ({
        id: section.id, title: section.title, order: section.order,
        lines: [...section.lines].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(line => ({
          id: line.id, productId: line.productId, label: line.label, description: line.description,
          quantity: line.quantity, unitPriceCents: line.unitPriceCents, tvaRate: line.tvaRate, order: line.order,
        })),
      })),
    })),
  })).digest("hex")
}
