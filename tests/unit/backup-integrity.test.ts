import { describe, expect, it } from "vitest"
import {
  assembleReversibilityExport,
  canonicalStringify,
  redactSensitiveExportValues,
  REVERSIBILITY_SCHEMA,
  sha256Hex,
  verifyReversibilityExport,
  type ReversibilityExportBase,
} from "@/lib/backup-integrity"

function baseExport(): ReversibilityExportBase {
  const bytes = Buffer.from("preuve-crm")
  return {
    schema: REVERSIBILITY_SCHEMA,
    exportId: "export-1",
    exportedAt: "2026-08-24T08:00:00.000Z",
    scope: { companyId: "company-1", requestedByUserId: "user-1", kind: "COMPANY_BUSINESS_DATA" },
    restoration: {
      automaticRestoreSupported: false,
      mode: "CONTROLLED_LOGICAL_IMPORT",
      reason: "Import contrôlé requis.",
    },
    collectionWarnings: [],
    tables: [
      { model: "Company", rows: [{ name: "Entreprise exemple", id: "company-1" }] },
      { model: "CustomerOrder", rows: [{ id: "order-1", totalTtcCents: 125_000 }] },
    ],
    files: [{
      storageKey: "local:company-1/generated/invoice.pdf",
      storage: "LOCAL",
      status: "EMBEDDED",
      references: [{
        model: "Invoice",
        recordId: "invoice-1",
        field: "pdfUrl",
        expectedSize: bytes.byteLength,
        expectedSha256: sha256Hex(bytes),
      }],
      size: bytes.byteLength,
      sha256: sha256Hex(bytes),
      contentBase64: bytes.toString("base64"),
    }],
  }
}

describe("manifestes de réversibilité", () => {
  it("retire récursivement les secrets sans supprimer les preuves métier", () => {
    expect(redactSensitiveExportValues({
      id: "connection-1",
      iban: "encrypted-iban",
      credentialsEncrypted: "ciphertext",
      nested: { authorization: "Bearer secret", proofHash: "proof", sha256: "digest" },
      rows: [{ refresh_token: "oauth", label: "conservé" }],
    })).toEqual({
      id: "connection-1",
      nested: { proofHash: "proof", sha256: "digest" },
      rows: [{ label: "conservé" }],
    })
  })

  it("canonicalise les objets indépendamment de l’ordre des clés", () => {
    expect(canonicalStringify({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(canonicalStringify({ a: { c: 3, d: 4 }, b: 2 }))
  })

  it("valide un export complet et autoportant", () => {
    const payload = assembleReversibilityExport(baseExport())
    const result = verifyReversibilityExport(payload)

    expect(result).toMatchObject({ ok: true, status: "COMPLETE", errors: [] })
    expect(payload.manifest.tables.find((table) => table.model === "CustomerOrder")?.rowCount).toBe(1)
    expect(payload.manifest.files).toMatchObject({ total: 1, embedded: 1, bytesEmbedded: 10 })
  })

  it("détecte toute modification d’une ligne après export", () => {
    const payload = assembleReversibilityExport(baseExport())
    payload.tables[1].rows[0].totalTtcCents = 1

    const result = verifyReversibilityExport(payload)

    expect(result.ok).toBe(false)
    expect(result.errors).toContain("Empreinte globale invalide.")
    expect(result.errors).toContain("Empreinte invalide pour CustomerOrder.")
  })

  it("détecte la modification du contenu binaire", () => {
    const payload = assembleReversibilityExport(baseExport())
    payload.files[0].contentBase64 = Buffer.from("fichier-altéré").toString("base64")

    const result = verifyReversibilityExport(payload)

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes("invoice.pdf"))).toBe(true)
  })

  it("annonce honnêtement un export partiel quand un fichier reste externe", () => {
    const base = baseExport()
    base.files = [{
      storageKey: "https://archive.example/facture.pdf",
      storage: "EXTERNAL",
      status: "EXTERNAL_REFERENCE",
      references: [{ model: "Invoice", recordId: "invoice-1", field: "pdfUrl" }],
    }]
    const payload = assembleReversibilityExport(base)
    const result = verifyReversibilityExport(payload)

    expect(result).toMatchObject({ ok: true, status: "PARTIAL" })
    expect(payload.manifest.files.externalReferences).toBe(1)
    expect(payload.manifest.warnings[0]).toContain("externe")
  })

  it("conserve une copie récupérable tout en signalant une empreinte source divergente", () => {
    const base = baseExport()
    base.files[0].status = "CORRUPT"
    base.files[0].references[0].expectedSha256 = "0".repeat(64)
    const payload = assembleReversibilityExport(base)

    expect(verifyReversibilityExport(payload)).toMatchObject({ ok: true, status: "PARTIAL" })
    expect(payload.manifest.files.corrupt).toBe(1)
  })
})
