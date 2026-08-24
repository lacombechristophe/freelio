import { pdfFontFaceCss } from "@/lib/pdf/typography"

type InterventionReportDocument = {
  id: string
  title: string
  type: string
  status: string
  scheduledStart: Date
  scheduledEnd?: Date | null
  startedAt?: Date | null
  completedAt?: Date | null
  report?: string | null
  laborMinutes: number
  customerName?: string | null
  signedAt?: Date | null
  signatureSha256?: string | null
  ticketNumber?: string | null
  technician?: string | null
  company: { name: string; address?: string | null; email?: string | null; phone?: string | null; siret?: string | null; brandColor?: string | null }
  client: { name: string }
  site: { label: string; address1: string; address2?: string | null; postalCode?: string | null; city?: string | null }
  files: Array<{ name: string; kind: string; size: number; sha256?: string | null }>
}

function escapeHtml(value: string | null | undefined) {
  return (value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

function multiline(value: string | null | undefined) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>")
}

function dateTime(value: Date | null | undefined) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(value) : "—"
}

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours} h${rest ? ` ${rest} min` : ""}` : `${rest} min`
}

function bytes(value: number) {
  if (value < 1024) return `${value} octets`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`
  return `${(value / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`
}

function color(value: string | null | undefined) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#0b63f6"
}

export function renderInterventionReportHtml(doc: InterventionReportDocument) {
  const accent = color(doc.company.brandColor)
  const reference = doc.ticketNumber || `INT-${doc.id.slice(-8).toUpperCase()}`
  const siteAddress = [doc.site.address1, doc.site.address2, [doc.site.postalCode, doc.site.city].filter(Boolean).join(" ")].filter(Boolean).map((line) => escapeHtml(line || "")).join("<br>")
  const companyLine = [doc.company.address, doc.company.email, doc.company.phone, doc.company.siret ? `SIRET ${doc.company.siret}` : null].filter(Boolean).map((item) => escapeHtml(item || "")).join(" · ")
  const status = doc.status === "COMPLETED" ? "Terminée" : doc.status

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport ${escapeHtml(reference)}</title>
<style>
  @page { size: A4; margin: 0; }
  ${pdfFontFaceCss()}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { background: #fff; color: #101828; font-family: "CRM Sans", Arial, sans-serif; font-size: 9.5pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { min-height: 297mm; padding: 12mm 15mm 16mm; position: relative; width: 210mm; }
  .rule { background: ${accent}; height: 2.5px; width: 26mm; }
  header { align-items: start; border-bottom: 1px solid #dce3ed; display: grid; gap: 12mm; grid-template-columns: minmax(0, 1fr) 52mm; padding: 5mm 0 6mm; }
  .kind { color: ${accent}; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; }
  h1 { font-family: "CRM Serif", Georgia, serif; font-size: 21pt; letter-spacing: -0.018em; line-height: 1.08; margin: 3mm 0 0; }
  .reference { border-top: 2px solid #101828; padding-top: 3mm; }
  .label { color: #667085; font-size: 7pt; font-weight: 700; text-transform: uppercase; }
  .reference strong { display: block; font-size: 10pt; margin-top: 1.5mm; }
  .reference .status { color: ${accent}; font-size: 8.5pt; margin-top: 3mm; }
  .parties { border-bottom: 1px solid #dce3ed; display: grid; grid-template-columns: 1fr 1fr; }
  .party { min-height: 32mm; padding: 5mm 7mm 5mm 0; }
  .party + .party { border-left: 1px solid #dce3ed; padding-left: 7mm; }
  .party h2 { font-size: 12pt; margin: 2mm 0; }
  .party p { color: #475467; margin: 0; }
  .facts { background: #f5f7fa; border: 1px solid #e4e7ec; display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 6mm; }
  .fact { min-width: 0; padding: 3.5mm; }
  .fact + .fact { border-left: 1px solid #e4e7ec; }
  .fact strong { display: block; font-size: 8.5pt; margin-top: 1mm; overflow-wrap: anywhere; }
  section { margin-top: 7mm; }
  section h2 { border-bottom: 1px solid #dce3ed; font-size: 11pt; margin: 0 0 3mm; padding-bottom: 2mm; }
  .report { color: #344054; font-size: 10pt; line-height: 1.6; min-height: 26mm; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border-bottom: 1px solid #e4e7ec; padding: 2.5mm 2mm; text-align: left; }
  th { color: #667085; font-size: 7pt; text-transform: uppercase; }
  td { font-size: 8pt; }
  .proof { border: 1px solid ${accent}; break-inside: avoid; display: grid; gap: 6mm; grid-template-columns: 1fr 1fr; padding: 4mm; }
  .proof strong { display: block; margin-top: 1mm; }
  .digest { color: #475467; font-family: monospace; font-size: 6.8pt; overflow-wrap: anywhere; }
  footer { border-top: 1px solid #dce3ed; color: #667085; font-size: 6.5pt; margin-top: 8mm; padding-top: 2.5mm; }
  @media screen { body { background: #e4e7ec; padding: 20px; } .page { background: #fff; box-shadow: 0 2px 8px rgba(16,24,40,.12); margin: auto; } }
</style>
</head>
<body>
<main class="page">
  <div class="rule"></div>
  <header>
    <div><div class="kind">Rapport d’intervention</div><h1>${escapeHtml(doc.title)}</h1></div>
    <div class="reference"><span class="label">Référence</span><strong>${escapeHtml(reference)}</strong><div class="status">${escapeHtml(status)}</div></div>
  </header>
  <div class="parties">
    <div class="party"><span class="label">Intervenant</span><h2>${escapeHtml(doc.company.name)}</h2><p>${doc.technician ? `Technicien : ${escapeHtml(doc.technician)}<br>` : ""}${companyLine}</p></div>
    <div class="party"><span class="label">Client et site</span><h2>${escapeHtml(doc.client.name)} · ${escapeHtml(doc.site.label)}</h2><p>${siteAddress}</p></div>
  </div>
  <div class="facts">
    <div class="fact"><span class="label">Planifiée</span><strong>${escapeHtml(dateTime(doc.scheduledStart))}</strong></div>
    <div class="fact"><span class="label">Début réel</span><strong>${escapeHtml(dateTime(doc.startedAt))}</strong></div>
    <div class="fact"><span class="label">Fin</span><strong>${escapeHtml(dateTime(doc.completedAt))}</strong></div>
    <div class="fact"><span class="label">Temps passé</span><strong>${escapeHtml(duration(doc.laborMinutes))}</strong></div>
  </div>
  <section><h2>Compte rendu terrain</h2><div class="report">${multiline(doc.report || "Aucun compte rendu renseigné.")}</div></section>
  ${doc.files.length ? `<section><h2>Pièces jointes et photos (${doc.files.length})</h2><table><thead><tr><th>Nom</th><th>Nature</th><th>Taille</th><th>Empreinte SHA-256</th></tr></thead><tbody>${doc.files.map((file) => `<tr><td>${escapeHtml(file.name)}</td><td>${escapeHtml(file.kind === "PHOTO" ? "Photo" : "Document")}</td><td>${escapeHtml(bytes(file.size))}</td><td class="digest">${escapeHtml(file.sha256 || "Non disponible")}</td></tr>`).join("")}</tbody></table></section>` : ""}
  <section><h2>Accord client et intégrité</h2><div class="proof"><div><span class="label">Client présent</span><strong>${escapeHtml(doc.customerName || "Non renseigné")}</strong><p>Accord horodaté le ${escapeHtml(dateTime(doc.signedAt))}</p></div><div><span class="label">Empreinte du rapport</span><strong class="digest">${escapeHtml(doc.signatureSha256 || "Rapport non scellé")}</strong></div></div></section>
  <footer><strong>${escapeHtml(doc.company.name)}</strong> · Rapport généré depuis le dossier d’intervention · Les originaux des pièces restent conservés dans la GED privée.</footer>
</main>
</body>
</html>`
}
