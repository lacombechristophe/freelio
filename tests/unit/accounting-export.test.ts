import { describe, expect, it } from "vitest"

import { buildPreAccountingJournal, journalBalance, PRE_ACCOUNTING_COLUMNS, rowsToCsv } from "@/lib/accounting/export"

describe("export précomptable entreprise", () => {
  it("produit des écritures équilibrées pour vente, paiement, avoir et achat", () => {
    const invoices = [
      { id: "inv-1", number: "FACT-2026-001", object: "Couverture", type: "STANDARD", date: new Date("2026-01-10T00:00:00Z"), lockedAt: new Date("2026-01-10T00:00:00Z"), totalHtCents: 10_000, totalTvaCents: 2_000, totalTtcCents: 12_000, client: { id: "client-1", name: "Client test" }, payments: [{ id: "pay-1", amountCents: 12_000, date: new Date("2026-01-20T00:00:00Z"), method: "TRANSFER", reference: "VIR-1" }] },
      { id: "inv-2", number: "AV-2026-001", object: "Avoir partiel", type: "CREDIT_NOTE", date: new Date("2026-01-25T00:00:00Z"), lockedAt: new Date("2026-01-25T00:00:00Z"), totalHtCents: -2_000, totalTvaCents: -400, totalTtcCents: -2_400, client: { id: "client-1", name: "Client test" }, payments: [] },
    ]
    const expenses = [{ id: "expense-1", label: "Fournitures", provider: "Fournisseur test", amountCents: 6_000, tvaCents: 1_000, date: new Date("2026-01-15T00:00:00Z"), createdAt: new Date("2026-01-15T12:00:00Z") }]
    const rows = buildPreAccountingJournal({ invoices, expenses })

    expect(journalBalance(rows)).toEqual({ debitCents: 32_400, creditCents: 32_400, balanced: true })
    expect(rows.every((item) => item.EcritureNum && item.ValidDate)).toBe(true)
  })

  it("conserve les 18 colonnes et neutralise les formules CSV", () => {
    const csv = rowsToCsv(PRE_ACCOUNTING_COLUMNS, [{ ...Object.fromEntries(PRE_ACCOUNTING_COLUMNS.map((column) => [column, ""])), EcritureLib: "=DANGEREUX" }])
    expect(csv.split("\r\n")[0].split(";")).toHaveLength(18)
    expect(csv).toContain("'=DANGEREUX")
  })
})
