import { pdfFontFaceCss } from "@/lib/pdf/typography"

type PurchaseOrderDocument = {
  number: string
  status: string
  orderDate: Date
  expectedAt?: Date | null
  confirmedExpectedAt?: Date | null
  supplierReference?: string | null
  notes?: string | null
  totalHtCents: number
  company: { name: string; address?: string | null; email?: string | null; phone?: string | null; siret?: string | null; brandColor?: string | null }
  supplier: { name: string; address?: string | null; email?: string | null; phone?: string | null }
  project?: { name: string } | null
  approver?: string | null
  approvedAt?: Date | null
  lines: Array<{ label: string; quantity: number; receivedQuantity: number; creditedQuantity: number; unitPriceCents: number }>
}

function escapeHtml(value: string | null | undefined) {
  return (value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

function money(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value / 100)
}

function date(value: Date | null | undefined) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(value) : "—"
}

function statusLabel(status: string) {
  return ({
    DRAFT: "Brouillon",
    PENDING_APPROVAL: "En attente d’approbation",
    APPROVED: "Approuvée",
    SENT: "Envoyée",
    ACKNOWLEDGED: "Accusée par le fournisseur",
    PARTIALLY_RECEIVED: "Réception partielle",
    RECEIVED_WITH_ISSUES: "Réception avec anomalies",
    RECEIVED: "Réceptionnée",
    CANCELLED: "Annulée",
  } as Record<string, string>)[status] || status
}

export function renderPurchaseOrderHtml(order: PurchaseOrderDocument) {
  const accent = "#202630"
  const companyLine = [order.company.address, order.company.email, order.company.phone, order.company.siret ? `SIRET ${order.company.siret}` : null].filter(Boolean).map((value) => escapeHtml(value || "")).join(" · ")
  const supplierLine = [order.supplier.address, order.supplier.email, order.supplier.phone].filter(Boolean).map((value) => escapeHtml(value || "")).join(" · ")
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Commande fournisseur ${escapeHtml(order.number)}</title><style>@page{size:A4;margin:0}${pdfFontFaceCss()}*{box-sizing:border-box}body{margin:0;color:#101828;font-family:"CRM Sans",Arial,sans-serif;font-size:9.5pt;line-height:1.45}.page{min-height:297mm;padding:12mm 15mm 16mm}.rule{height:2.5px;width:26mm;background:${accent}}header{display:grid;grid-template-columns:minmax(0,1fr) 52mm;gap:12mm;border-bottom:1px solid #dce3ed;padding:5mm 0 6mm}.kind,.label{color:#667085;font-size:7pt;font-weight:700;text-transform:uppercase}.kind{color:${accent};font-size:7.5pt}h1{font-family:"CRM Serif",Georgia,serif;font-size:22pt;line-height:1.08;margin:3mm 0 0}.reference{border-top:2px solid #101828;padding-top:3mm}.reference strong{display:block;font-size:10pt;margin-top:1.5mm}.parties{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #dce3ed}.party{min-height:34mm;padding:5mm 7mm 5mm 0}.party+.party{border-left:1px solid #dce3ed;padding-left:7mm}.party h2{font-size:12pt;margin:2mm 0}.party p{color:#475467;margin:0}.facts{display:grid;grid-template-columns:repeat(3,1fr);margin-top:6mm;border:1px solid #e4e7ec;background:#f5f7fa}.fact{padding:3.5mm}.fact+.fact{border-left:1px solid #e4e7ec}.fact strong{display:block;margin-top:1mm}table{border-collapse:collapse;margin-top:7mm;width:100%}th,td{border-bottom:1px solid #e4e7ec;padding:3mm 2mm;text-align:left}th{color:#667085;font-size:7pt;text-transform:uppercase}td:nth-last-child(-n+2),th:nth-last-child(-n+2){text-align:right}.total{display:flex;justify-content:flex-end;margin-top:5mm}.total div{min-width:58mm;border-top:2px solid ${accent};padding-top:3mm;text-align:right}.total strong{font-size:14pt}.approval,.notes{break-inside:avoid;margin-top:7mm;border:1px solid #dce3ed;padding:4mm}.approval p,.notes p{margin:1mm 0 0;color:#475467}footer{border-top:1px solid #dce3ed;color:#667085;font-size:6.5pt;margin-top:10mm;padding-top:2.5mm}</style></head><body><main class="page"><div class="rule"></div><header><div><div class="kind">Commande fournisseur</div><h1>${escapeHtml(order.number)}</h1></div><div class="reference"><span class="label">Statut</span><strong>${escapeHtml(statusLabel(order.status))}</strong><span class="label" style="display:block;margin-top:3mm">${escapeHtml(order.project?.name || "Approvisionnement")}</span></div></header><div class="parties"><div class="party"><span class="label">Acheteur</span><h2>${escapeHtml(order.company.name)}</h2><p>${companyLine}</p></div><div class="party"><span class="label">Fournisseur</span><h2>${escapeHtml(order.supplier.name)}</h2><p>${supplierLine || "Coordonnées non renseignées"}</p></div></div><div class="facts"><div class="fact"><span class="label">Commande</span><strong>${escapeHtml(date(order.orderDate))}</strong></div><div class="fact"><span class="label">Livraison attendue</span><strong>${escapeHtml(date(order.confirmedExpectedAt || order.expectedAt))}</strong></div><div class="fact"><span class="label">Référence fournisseur</span><strong>${escapeHtml(order.supplierReference || "En attente")}</strong></div></div><table><thead><tr><th>Désignation</th><th>Quantité</th><th>PU HT</th><th>Total HT</th></tr></thead><tbody>${order.lines.map((line) => `<tr><td>${escapeHtml(line.label)}</td><td>${line.quantity}</td><td>${escapeHtml(money(line.unitPriceCents))}</td><td>${escapeHtml(money(line.quantity * line.unitPriceCents))}</td></tr>`).join("")}</tbody></table><div class="total"><div><span class="label">Total HT</span><br><strong>${escapeHtml(money(order.totalHtCents))}</strong></div></div>${order.approvedAt ? `<section class="approval"><span class="label">Approbation interne</span><p>Approuvée le ${escapeHtml(date(order.approvedAt))}${order.approver ? ` par ${escapeHtml(order.approver)}` : ""}.</p></section>` : ""}${order.notes ? `<section class="notes"><span class="label">Instructions</span><p>${escapeHtml(order.notes)}</p></section>` : ""}<footer><strong>${escapeHtml(order.company.name)}</strong> · ${escapeHtml(order.number)} · Document d’approvisionnement généré depuis le CRM.</footer></main></body></html>`
}
