import {
  generateCii,
  parseCiiInvoice,
  validateInput,
  type TeachingError,
} from "@attestwire/en16931"

/**
 * Data needed to produce the structured invoice attached to a PDF.
 * Monetary values stay in integer cents at the application boundary; the EN
 * 16931 adapter is the only place where euros are emitted.
 */
export interface FacturXData {
  number: string
  date: string
  seller: {
    name: string
    siret: string
    address: string
    vatNumber?: string
  }
  buyer: {
    name: string
    siret?: string
    address: string
    vatNumber?: string
  }
  lines: Array<{
    label: string
    quantity: number
    unitPriceCents: number
    totalHtCents: number
    tvaRate: number
  }>
  totalHtCents: number
  totalTvaCents: number
  totalTtcCents: number
}

export type FacturXValidation = {
  valid: boolean
  errors: TeachingError[]
  warnings: TeachingError[]
}

function addressParts(rawAddress: string) {
  const normalized = rawAddress
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ")

  // French exports generally end with `XXXXX City`. Split only when a real
  // five-digit postal code exists so we never mistake an identifier for a city.
  const match = normalized.match(/(?:^|,\s*)(\d{5})\s+([^,]+)$/)
  if (match && match.index != null) {
    const line1 = normalized.slice(0, match.index).replace(/,\s*$/, "").trim()
    return {
      line1: line1 || normalized,
      postalCode: match[1],
      city: match[2].trim(),
      countryCode: "FR",
    }
  }

  // The document quality panel still reports the missing address. Explicit
  // placeholders keep the CII shape deterministic for downstream parsers.
  return {
    line1: normalized || "Adresse non renseignée",
    postalCode: "00000",
    city: "Non renseigné",
    countryCode: "FR",
  }
}

function taxCategory(rate: number) {
  return rate > 0 ? ("S" as const) : ("E" as const)
}

/**
 * Generate the CII payload used by Factur-X. XML is produced by a maintained
 * EN 16931 model rather than hand-concatenated, then validated before it is
 * allowed to be embedded in a PDF.
 */
export function generateFacturX(data: FacturXData) {
  const input = {
    profile: "facturx-en16931" as const,
    invoiceNumber: data.number,
    issueDate: data.date,
    currency: "EUR",
    invoiceTypeCode: "380",
    seller: {
      name: data.seller.name,
      legalRegistrationId: data.seller.siret || undefined,
      vatId: data.seller.vatNumber || undefined,
      address: addressParts(data.seller.address),
    },
    buyer: {
      name: data.buyer.name,
      legalRegistrationId: data.buyer.siret || undefined,
      vatId: data.buyer.vatNumber || undefined,
      address: addressParts(data.buyer.address),
    },
    lines: data.lines.map((line, index) => ({
      id: String(index + 1),
      description: line.label,
      quantity: line.quantity,
      unitCode: "C62",
      unitPrice: line.unitPriceCents / 100,
      vatCategory: taxCategory(line.tvaRate),
      vatRate: line.tvaRate > 0 ? line.tvaRate : undefined,
    })),
    declaredTotals: {
      lineExtensionAmount: data.totalHtCents / 100,
      taxExclusiveAmount: data.totalHtCents / 100,
      taxAmount: data.totalTvaCents / 100,
      taxInclusiveAmount: data.totalTtcCents / 100,
      payableAmount: data.totalTtcCents / 100,
    },
    vatExemptionReasons: { E: "Franchise en base de TVA – article 293 B du CGI" },
  }

  const sourceValidation = validateInput(input)
  if (!sourceValidation.valid) {
    const detail = sourceValidation.errors.map((error) => `${error.rule}: ${error.message}`).join("; ")
    throw new Error(`Factur-X non conforme : ${detail}`)
  }

  const xml = generateCii(input)
  const validation = validateFacturXXml(xml)
  if (!validation.valid) {
    const detail = validation.errors.map((error) => `${error.rule}: ${error.message}`).join("; ")
    throw new Error(`Factur-X non conforme : ${detail}`)
  }
  return xml
}

/** Parse and run the EN 16931 rule set against a generated or imported CII. */
export function validateFacturXXml(xml: string): FacturXValidation {
  try {
    const parsed = parseCiiInvoice(xml)
    const result = validateInput(parsed.invoice)
    return { valid: result.valid, errors: result.errors, warnings: result.warnings }
  } catch (error) {
    return {
      valid: false,
      errors: [{
        rule: "XML-SYNTAX",
        field: "BT-1",
        severity: "fatal",
        message: error instanceof Error ? error.message : "Le XML Factur-X est illisible.",
        fix: "Regénérez le document depuis une facture valide.",
        docsUrl: "https://www.factur-x.org/",
      }],
      warnings: [],
    }
  }
}
