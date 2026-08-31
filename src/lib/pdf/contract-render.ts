import { sanitizeContractHtml } from "@/lib/contracts/html"
import { pdfFontFaceCss } from "@/lib/pdf/typography"

export type ContractPdfDocument = {
  number: string
  title: string
  status: string
  contentHtml: string
  createdAt: Date | string
  validFrom?: Date | string | null
  validUntil?: Date | string | null
  client: {
    name: string
    address?: string | null
    siret?: string | null
    email?: string | null
  }
  company: {
    name: string
    fullName?: string | null
    address?: string | null
    email?: string | null
    phone?: string | null
    logo?: string | null
    siret?: string | null
    tvaNumber?: string | null
    apeCode?: string | null
    rcsNumber?: string | null
    brandColor?: string | null
  }
  signatures?: Array<{
    signerName: string
    signerEmail: string
    signedAt: Date | string
    canvasData?: string | null
  }>
}

const statusLabels: Record<string, string> = {
  DRAFT: "Brouillon",
  SENT: "En attente de signature",
  SIGNED: "Sign&eacute;",
  EXPIRED: "Expir&eacute;",
}

function escapeHtml(value: string | null | undefined) {
  if (!value) return ""
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function withLineBreaks(value: string | null | undefined) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>")
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Non pr&eacute;cis&eacute;e"
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function safeImageSource(source: string | null | undefined, allowRemote = false) {
  if (!source) return null
  const trimmed = source.trim()
  if (/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) return trimmed
  if (allowRemote && /^https?:\/\/[^\s]+$/i.test(trimmed)) return trimmed
  return null
}

function statusLabel(status: string) {
  return statusLabels[status.toUpperCase()] ?? escapeHtml(status)
}

function partyDetails(items: Array<[string, string | null | undefined]>) {
  return items
    .filter(([, value]) => !!value)
    .map(
      ([label, value]) => `
        <div class="party-detail">
          <dt>${escapeHtml(label)}</dt>
          <dd>${withLineBreaks(value)}</dd>
        </div>
      `
    )
    .join("")
}

function metaItem(label: string, value: string) {
  return `
    <div class="meta-item">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `
}

function signatureMarkup(doc: ContractPdfDocument) {
  const signatures = doc.signatures ?? []

  if (!signatures.length) {
    return `
      <div class="signature-placeholder">
        <span>Date</span>
        <span>Nom, qualit&eacute; et signature</span>
      </div>
    `
  }

  return signatures
    .map((signature) => {
      const image = safeImageSource(signature.canvasData)
      return `
        <div class="signed-entry">
          <div class="signed-state">Sign&eacute; &eacute;lectroniquement</div>
          ${image ? `<img class="signature-image" src="${escapeHtml(image)}" alt="">` : ""}
          <strong>${escapeHtml(signature.signerName)}</strong>
          <span>${escapeHtml(signature.signerEmail)}</span>
          <span>Le ${formatDate(signature.signedAt)}</span>
        </div>
      `
    })
    .join("")
}

export function renderContractHtml(doc: ContractPdfDocument) {
  const safeContent = sanitizeContractHtml(doc.contentHtml)
  const primary = "#202630"
  const logo = safeImageSource(doc.company.logo, true)
  const companyLegal = [
    escapeHtml(doc.company.name),
    doc.company.fullName ? escapeHtml(doc.company.fullName) : "",
    doc.company.siret ? `SIRET ${escapeHtml(doc.company.siret)}` : "",
    doc.company.apeCode ? `APE ${escapeHtml(doc.company.apeCode)}` : "",
    doc.company.rcsNumber ? `RCS ${escapeHtml(doc.company.rcsNumber)}` : "",
    doc.company.tvaNumber ? `TVA ${escapeHtml(doc.company.tvaNumber)}` : "",
    doc.company.email ? escapeHtml(doc.company.email) : "",
  ].filter(Boolean)

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contrat ${escapeHtml(doc.number)}</title>
<style>
  @page { size: A4; margin: 0; }
  ${pdfFontFaceCss()}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #ffffff;
    color: #202630;
    font-family: "CRM Sans", Arial, sans-serif;
    font-size: 9.7pt;
    font-variant-numeric: lining-nums tabular-nums;
    line-height: 1.48;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    --page-inline: 14mm;
    min-height: 297mm;
    padding: 10mm var(--page-inline) 18mm;
    position: relative;
    width: 210mm;
  }
  @media screen {
    body { background: #dfe3e8; padding: 20px; }
    .page { background: #ffffff; box-shadow: 0 22px 48px rgba(30, 36, 48, 0.14); margin: 0 auto; }
  }
  .accent-rule { background: ${primary}; height: 2.5px; width: 22mm; }
  .header {
    align-items: start;
    border-bottom: 1px solid #aeb6c1;
    display: grid;
    gap: 12mm;
    grid-template-columns: minmax(0, 1fr) 55mm;
    padding: 4mm 0 5mm;
  }
  .document-kind { color: ${primary}; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
  h1 {
    color: #1a2029;
    font-family: "CRM Serif", Georgia, serif;
    font-size: 21.5pt;
    font-weight: 600;
    letter-spacing: -0.018em;
    line-height: 1.08;
    margin: 4mm 0 0;
    overflow-wrap: anywhere;
  }
  .number { color: ${primary}; font-size: 9.4pt; font-weight: 700; margin-top: 3mm; }
  .header-meta { border-top: 2px solid #202630; }
  .header-meta-row { border-bottom: 1px solid #dce0e5; padding: 3mm 0; }
  .header-meta-row span { color: #6b7585; display: block; font-size: 6.8pt; font-weight: 700; letter-spacing: 0.035em; text-transform: uppercase; }
  .header-meta-row strong { color: #202630; display: block; font-size: 9.2pt; margin-top: 3px; }
  .header-meta-row.status strong { color: ${primary}; }
  .parties {
    border-bottom: 1px solid #cfd5dc;
    border-top: 1px solid #cfd5dc;
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin-top: 6mm;
  }
  .party { min-width: 0; padding: 4mm 6mm 4mm 0; }
  .party + .party { border-left: 1px solid #dce0e5; padding-left: 6mm; padding-right: 0; }
  .label { color: #6b7585; font-size: 7pt; font-weight: 700; letter-spacing: 0.035em; text-transform: uppercase; }
  .party h2 { color: #1d242e; font-size: 12.5pt; line-height: 1.2; margin: 4px 0 3mm; }
  .party-details { display: grid; gap: 2.2mm; margin: 0; }
  .party-detail { display: grid; gap: 3mm; grid-template-columns: 19mm minmax(0, 1fr); }
  .party-detail dt { color: #717b8b; font-size: 7pt; font-weight: 650; text-transform: uppercase; }
  .party-detail dd { color: #303846; font-size: 8.3pt; line-height: 1.35; margin: 0; overflow-wrap: anywhere; }
  .meta-grid {
    background: #f3f5f7;
    border-bottom: 1px solid #d7dce3;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 4.5mm 0 6mm;
  }
  .meta-item { min-width: 0; padding: 3mm 4mm; }
  .meta-item + .meta-item { border-left: 1px solid #d7dce3; }
  .meta-item span { color: #6b7585; display: block; font-size: 6.8pt; font-weight: 700; letter-spacing: 0.035em; text-transform: uppercase; }
  .meta-item strong { color: #252d39; display: block; font-size: 8.9pt; margin-top: 3px; overflow-wrap: anywhere; }
  .content { color: #29313d; counter-reset: section; }
  .content > h1 { display: none; }
  .content h2 {
    border-top: 1px solid #dce0e5;
    break-after: avoid;
    color: #1d242e;
    counter-increment: section;
    font-size: 12pt;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.25;
    margin: 6mm 0 2.5mm;
    padding-top: 3.5mm;
  }
  .content h2::before { color: ${primary}; content: counter(section, decimal-leading-zero) "  "; font-size: 8pt; margin-right: 2mm; }
  .content h3 { break-after: avoid; color: #252d39; font-size: 10.5pt; margin: 4mm 0 1.5mm; }
  .content p { margin: 0 0 2.5mm; max-width: 175mm; orphans: 3; widows: 3; }
  .content ul, .content ol { margin: 0 0 3.5mm 4mm; padding-left: 4mm; }
  .content li { margin-bottom: 1.2mm; }
  .content blockquote { border-left: 1px solid ${primary}; color: #4f5968; margin: 3mm 0; padding: 1mm 0 1mm 5mm; }
  .content table { border-collapse: collapse; margin: 4mm 0; width: 100%; }
  .content th, .content td { border-bottom: 1px solid #dce0e5; padding: 2.5mm; text-align: left; vertical-align: top; }
  .content th { background: #f3f5f7; color: #343d4a; font-size: 7.5pt; text-transform: uppercase; }
  .signatures { border-top: 1.5px solid #202630; break-inside: avoid; margin-top: 8mm; page-break-inside: avoid; padding-top: 4mm; }
  .signatures-heading { align-items: baseline; display: flex; justify-content: space-between; margin-bottom: 3.5mm; }
  .signatures-heading h2 { color: #1d242e; font-size: 12pt; margin: 0; }
  .signatures-heading span { color: #697386; font-size: 7.2pt; }
  .signature-grid { display: grid; gap: 8mm; grid-template-columns: 1fr 1fr; }
  .signature-block { min-height: 31mm; padding-top: 2mm; }
  .signature-block + .signature-block { border-left: 1px solid #dce0e5; padding-left: 8mm; }
  .signature-party { color: #202630; font-size: 9.2pt; font-weight: 700; margin-top: 3px; }
  .signature-placeholder { color: #6b7585; display: grid; font-size: 7.2pt; gap: 7mm; grid-template-columns: 25mm minmax(0, 1fr); margin-top: 8mm; }
  .signature-placeholder span { border-top: 1px solid #aeb6c1; padding-top: 3px; }
  .signed-entry { color: #596476; display: flex; flex-direction: column; font-size: 7.8pt; margin-top: 3mm; }
  .signed-entry + .signed-entry { border-top: 1px solid #dce0e5; padding-top: 3mm; }
  .signed-entry strong { color: #202630; font-size: 9.2pt; }
  .signed-state { color: ${primary}; font-size: 7pt; font-weight: 700; letter-spacing: 0.03em; margin-bottom: 2mm; text-transform: uppercase; }
  .signature-image { display: block; height: 15mm; margin: 0 0 2mm; max-width: 55mm; object-fit: contain; object-position: left center; }
  footer {
    background: #ffffff;
    border-top: 1px solid #d7dce3;
    color: #697386;
    font-size: 6.4pt;
    line-height: 1.3;
    margin-top: 7mm;
    padding-top: 2.5mm;
  }
  .footer-top { align-items: baseline; color: #353e4b; display: grid; gap: 8mm; grid-template-columns: minmax(0, 1fr) auto; }
  .footer-reference { font-weight: 650; white-space: nowrap; }
  .footer-note { margin-top: 2px; }
  @media print {
    body { background: #ffffff; }
    .page { box-shadow: none; }
    footer { bottom: 5.5mm; left: var(--page-inline); margin: 0; position: fixed; right: var(--page-inline); }
  }
</style>
</head>
<body>
<main class="page" data-document-kind="contract" data-status="${escapeHtml(doc.status.toLowerCase())}">
  <div class="accent-rule"></div>
  <header class="header">
    <div>
      ${
        logo
          ? `<img src="${escapeHtml(logo)}" alt="" style="display:block;height:10mm;max-width:35mm;object-fit:contain;object-position:left top;margin-bottom:4mm;">`
          : ""
      }
      <div class="document-kind">Contrat de prestation</div>
      <h1>${escapeHtml(doc.title)}</h1>
      <div class="number">${escapeHtml(doc.number)}</div>
    </div>
    <aside class="header-meta">
      <div class="header-meta-row status"><span>Statut</span><strong>${statusLabel(doc.status)}</strong></div>
      <div class="header-meta-row"><span>Cr&eacute;ation</span><strong>${formatDate(doc.createdAt)}</strong></div>
    </aside>
  </header>

  <section class="parties">
    <article class="party">
      <div class="label">Prestataire</div>
      <h2>${escapeHtml(doc.company.name)}</h2>
      <dl class="party-details">${partyDetails([
        ["Adresse", doc.company.address],
        ["Email", doc.company.email],
        ["T&eacute;l&eacute;phone", doc.company.phone],
        ["SIRET", doc.company.siret],
      ])}</dl>
    </article>
    <article class="party">
      <div class="label">Client</div>
      <h2>${escapeHtml(doc.client.name)}</h2>
      <dl class="party-details">${partyDetails([
        ["Adresse", doc.client.address],
        ["Email", doc.client.email],
        ["SIRET", doc.client.siret],
      ])}</dl>
    </article>
  </section>

  <section class="meta-grid">
    ${metaItem("Date d'effet", formatDate(doc.validFrom))}
    ${metaItem("Fin pr&eacute;vue", formatDate(doc.validUntil))}
    ${metaItem("R&eacute;f&eacute;rence", escapeHtml(doc.number))}
  </section>

  <section class="content">${safeContent}</section>

  <section class="signatures">
    <div class="signatures-heading">
      <h2>Acceptation et signatures</h2>
      <span>Chaque partie reconna&icirc;t avoir pris connaissance du pr&eacute;sent contrat.</span>
    </div>
    <div class="signature-grid">
      <div class="signature-block">
        <div class="label">Pour le prestataire</div>
        <div class="signature-party">${escapeHtml(doc.company.name)}</div>
        <div class="signature-placeholder"><span>Date</span><span>Nom, qualit&eacute; et signature</span></div>
      </div>
      <div class="signature-block">
        <div class="label">Pour le client</div>
        <div class="signature-party">${escapeHtml(doc.client.name)}</div>
        ${signatureMarkup(doc)}
      </div>
    </div>
  </section>

  <footer>
    <div class="footer-top">
      <strong>${companyLegal.join(" &middot; ")}</strong>
      <span class="footer-reference">CONTRAT ${escapeHtml(doc.number)}</span>
    </div>
    <div class="footer-note">Document contractuel &middot; ${escapeHtml(doc.company.name)} &middot; ${escapeHtml(doc.client.name)}</div>
  </footer>
</main>
</body>
</html>`
}
