import { pdfFontFaceCss } from "@/lib/pdf/typography"

type DeliveryDocument = {
  number: string
  status: string
  deliveredAt?: Date | null
  recipientName?: string | null
  signedAt?: Date | null
  signatureSha256?: string | null
  notes?: string | null
  company: { name: string; address?: string | null; email?: string | null; phone?: string | null; siret?: string | null; brandColor?: string | null }
  client: { name: string; address?: string | null }
  order: { number: string }
  site?: { label: string; address1: string; address2?: string | null; postalCode?: string | null; city?: string | null } | null
  lines: Array<{ label: string; quantity: number }>
}

function escapeHtml(value: string | null | undefined) {
  return (value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

function dateTime(value: Date | null | undefined) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(value) : "—"
}

function quantity(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(value)
}

export function renderDeliveryNoteHtml(doc: DeliveryDocument) {
  const accent = "#202630"
  const companyLine = [doc.company.address, doc.company.email, doc.company.phone, doc.company.siret ? `SIRET ${doc.company.siret}` : null].filter(Boolean).map((item) => escapeHtml(item || "")).join(" · ")
  const destination = doc.site
    ? [doc.site.label, doc.site.address1, doc.site.address2, [doc.site.postalCode, doc.site.city].filter(Boolean).join(" ")].filter(Boolean).map((item) => escapeHtml(item || "")).join("<br>")
    : escapeHtml(doc.client.address || "Adresse non renseignée")
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bon de livraison ${escapeHtml(doc.number)}</title><style>
  @page { size:A4; margin:0; } ${pdfFontFaceCss()} *{box-sizing:border-box}html,body{margin:0;padding:0}body{background:#fff;color:#101828;font-family:"CRM Sans",Arial,sans-serif;font-size:9.5pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{min-height:297mm;padding:12mm 15mm 16mm;width:210mm}.rule{height:2.5px;width:26mm;background:${accent}}header{display:grid;grid-template-columns:minmax(0,1fr) 52mm;gap:12mm;border-bottom:1px solid #dce3ed;padding:5mm 0 6mm}.kind,.label{color:#667085;font-size:7pt;font-weight:700;text-transform:uppercase}.kind{color:${accent};font-size:7.5pt}h1{font-family:"CRM Serif",Georgia,serif;font-size:22pt;letter-spacing:-.018em;line-height:1.08;margin:3mm 0 0}.reference{border-top:2px solid #101828;padding-top:3mm}.reference strong{display:block;font-size:10pt;margin-top:1.5mm}.parties{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #dce3ed}.party{min-height:34mm;padding:5mm 7mm 5mm 0}.party+.party{border-left:1px solid #dce3ed;padding-left:7mm}.party h2{font-size:12pt;margin:2mm 0}.party p{color:#475467;margin:0}.facts{display:grid;grid-template-columns:repeat(3,1fr);margin-top:6mm;border:1px solid #e4e7ec;background:#f5f7fa}.fact{padding:3.5mm}.fact+.fact{border-left:1px solid #e4e7ec}.fact strong{display:block;margin-top:1mm}table{border-collapse:collapse;margin-top:7mm;width:100%}th,td{border-bottom:1px solid #e4e7ec;padding:3mm;text-align:left}th{color:#667085;font-size:7pt;text-transform:uppercase}td:last-child,th:last-child{text-align:right}.notes{margin-top:7mm}.notes h2,.signature h2{border-bottom:1px solid #dce3ed;font-size:11pt;padding-bottom:2mm}.signature{break-inside:avoid;margin-top:8mm}.proof{display:grid;grid-template-columns:1fr 1fr;gap:8mm;border:1px solid ${accent};padding:4mm}.proof strong{display:block;margin-top:1mm}.digest{font-family:monospace;font-size:6.8pt;overflow-wrap:anywhere}footer{border-top:1px solid #dce3ed;color:#667085;font-size:6.5pt;margin-top:10mm;padding-top:2.5mm}@media screen{body{background:#e4e7ec;padding:20px}.page{background:#fff;box-shadow:0 2px 8px rgba(16,24,40,.12);margin:auto}}
</style></head><body><main class="page"><div class="rule"></div><header><div><div class="kind">Bon de livraison</div><h1>${escapeHtml(doc.number)}</h1></div><div class="reference"><span class="label">Commande</span><strong>${escapeHtml(doc.order.number)}</strong><span class="label" style="display:block;margin-top:3mm">${doc.status === "SIGNED" ? "Signé" : "Livré"}</span></div></header><div class="parties"><div class="party"><span class="label">Expéditeur</span><h2>${escapeHtml(doc.company.name)}</h2><p>${companyLine}</p></div><div class="party"><span class="label">Destinataire</span><h2>${escapeHtml(doc.client.name)}</h2><p>${destination}</p></div></div><div class="facts"><div class="fact"><span class="label">Livraison</span><strong>${escapeHtml(dateTime(doc.deliveredAt))}</strong></div><div class="fact"><span class="label">Réceptionnaire</span><strong>${escapeHtml(doc.recipientName || "À signer")}</strong></div><div class="fact"><span class="label">Signature</span><strong>${escapeHtml(dateTime(doc.signedAt))}</strong></div></div><table><thead><tr><th>Désignation</th><th>Quantité livrée</th></tr></thead><tbody>${doc.lines.map((line) => `<tr><td>${escapeHtml(line.label)}</td><td>${escapeHtml(quantity(line.quantity))}</td></tr>`).join("")}</tbody></table>${doc.notes ? `<section class="notes"><h2>Observations</h2><p>${escapeHtml(doc.notes)}</p></section>` : ""}<section class="signature"><h2>Réception et intégrité</h2><div class="proof"><div><span class="label">Réceptionnaire</span><strong>${escapeHtml(doc.recipientName || "Non signé")}</strong><p>${doc.signedAt ? `Réception confirmée le ${escapeHtml(dateTime(doc.signedAt))}` : "Signature en attente"}</p></div><div><span class="label">Empreinte SHA-256</span><strong class="digest">${escapeHtml(doc.signatureSha256 || "Bon non scellé")}</strong></div></div></section><footer><strong>${escapeHtml(doc.company.name)}</strong> · ${escapeHtml(doc.number)} · Document rattaché à la commande ${escapeHtml(doc.order.number)}</footer></main></body></html>`
}
