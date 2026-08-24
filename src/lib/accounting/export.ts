export const PRE_ACCOUNTING_COLUMNS = [
  "JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib",
  "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit",
  "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise",
] as const

export type PreAccountingRow = Record<(typeof PRE_ACCOUNTING_COLUMNS)[number], string>

type InvoiceRecord = {
  id: string
  number: string
  object: string
  type: string
  date: Date
  lockedAt: Date | null
  totalHtCents: number
  totalTvaCents: number
  totalTtcCents: number
  client: { id: string; name: string }
  payments: Array<{ id: string; amountCents: number; date: Date; method: string; reference: string | null }>
}

type ExpenseRecord = {
  id: string
  label: string
  provider: string | null
  amountCents: number
  tvaCents: number
  date: Date
  createdAt: Date
}

function dateField(value: Date) {
  return value.toISOString().slice(0, 10).replaceAll("-", "")
}

function amount(valueCents: number) {
  return (Math.abs(valueCents) / 100).toFixed(2)
}

function row(input: {
  journalCode: string
  journalLib: string
  number: string
  date: Date
  account: string
  accountLabel: string
  aux?: string
  auxLabel?: string
  piece: string
  label: string
  debitCents?: number
  creditCents?: number
  validDate?: Date
}): PreAccountingRow {
  return {
    JournalCode: input.journalCode,
    JournalLib: input.journalLib,
    EcritureNum: input.number,
    EcritureDate: dateField(input.date),
    CompteNum: input.account,
    CompteLib: input.accountLabel,
    CompAuxNum: input.aux ?? "",
    CompAuxLib: input.auxLabel ?? "",
    PieceRef: input.piece,
    PieceDate: dateField(input.date),
    EcritureLib: input.label,
    Debit: input.debitCents ? amount(input.debitCents) : "0.00",
    Credit: input.creditCents ? amount(input.creditCents) : "0.00",
    EcritureLet: "",
    DateLet: "",
    ValidDate: dateField(input.validDate ?? input.date),
    Montantdevise: "",
    Idevise: "EUR",
  }
}

export function buildPreAccountingJournal(input: { invoices: InvoiceRecord[]; expenses: ExpenseRecord[] }) {
  const rows: PreAccountingRow[] = []
  let sequence = 0
  const nextNumber = (journal: string) => `${journal}-${String(++sequence).padStart(8, "0")}`

  for (const invoice of input.invoices) {
    const entry = nextNumber("VE")
    const isCredit = invoice.type === "CREDIT_NOTE" || invoice.totalTtcCents < 0
    const label = `${isCredit ? "Avoir" : "Facture"} ${invoice.number} · ${invoice.object}`
    const aux = `CLI${invoice.client.id.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toUpperCase()}`
    const common = { journalCode: "VE", journalLib: "Journal des ventes", number: entry, date: invoice.date, piece: invoice.number, label, validDate: invoice.lockedAt ?? invoice.date }
    if (isCredit) {
      rows.push(row({ ...common, account: "707000", accountLabel: "Ventes de marchandises et prestations", debitCents: invoice.totalHtCents }))
      if (invoice.totalTvaCents) rows.push(row({ ...common, account: "445710", accountLabel: "TVA collectée", debitCents: invoice.totalTvaCents }))
      rows.push(row({ ...common, account: "411000", accountLabel: "Clients", aux, auxLabel: invoice.client.name, creditCents: invoice.totalTtcCents }))
    } else {
      rows.push(row({ ...common, account: "411000", accountLabel: "Clients", aux, auxLabel: invoice.client.name, debitCents: invoice.totalTtcCents }))
      rows.push(row({ ...common, account: "707000", accountLabel: "Ventes de marchandises et prestations", creditCents: invoice.totalHtCents }))
      if (invoice.totalTvaCents) rows.push(row({ ...common, account: "445710", accountLabel: "TVA collectée", creditCents: invoice.totalTvaCents }))
    }

    for (const payment of invoice.payments) {
      const paymentEntry = nextNumber("BQ")
      const paymentLabel = `Règlement ${invoice.number} · ${payment.method}`
      const paymentCommon = { journalCode: "BQ", journalLib: "Journal de banque", number: paymentEntry, date: payment.date, piece: payment.reference || invoice.number, label: paymentLabel, validDate: payment.date }
      rows.push(row({ ...paymentCommon, account: "512000", accountLabel: "Banque", debitCents: payment.amountCents }))
      rows.push(row({ ...paymentCommon, account: "411000", accountLabel: "Clients", aux, auxLabel: invoice.client.name, creditCents: payment.amountCents }))
    }
  }

  for (const expense of input.expenses) {
    const entry = nextNumber("AC")
    const htCents = expense.amountCents - expense.tvaCents
    const providerLabel = expense.provider || "Fournisseur non renseigné"
    const aux = `FOU${expense.id.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toUpperCase()}`
    const common = { journalCode: "AC", journalLib: "Journal des achats", number: entry, date: expense.date, piece: expense.id, label: expense.label, validDate: expense.createdAt }
    rows.push(row({ ...common, account: "606000", accountLabel: "Achats non stockés et charges", debitCents: htCents }))
    if (expense.tvaCents) rows.push(row({ ...common, account: "445660", accountLabel: "TVA déductible", debitCents: expense.tvaCents }))
    rows.push(row({ ...common, account: "401000", accountLabel: "Fournisseurs", aux, auxLabel: providerLabel, creditCents: expense.amountCents }))
  }

  return rows
}

function safeSpreadsheetText(value: string) {
  return /^[=+@]/.test(value) || (/^-/.test(value) && !/^-\d+(?:[.,]\d+)?$/.test(value)) ? `'${value}` : value
}

function csvCell(value: string) {
  const safe = safeSpreadsheetText(value).replaceAll('"', '""')
  return `"${safe}"`
}

export function rowsToCsv<T extends Record<string, unknown>>(columns: readonly string[], rows: T[]) {
  return [
    columns.map(csvCell).join(";"),
    ...rows.map((item) => columns.map((column) => csvCell(String(item[column] ?? ""))).join(";")),
  ].join("\r\n")
}

export function journalBalance(rows: PreAccountingRow[]) {
  const debitCents = rows.reduce((sum, item) => sum + Math.round(Number(item.Debit) * 100), 0)
  const creditCents = rows.reduce((sum, item) => sum + Math.round(Number(item.Credit) * 100), 0)
  return { debitCents, creditCents, balanced: debitCents === creditCents }
}
