import { pdfFontFaceCss } from "@/lib/pdf/typography"

export const PDF_TEMPLATES = ["MINIMAL", "PROFESSIONAL", "MODERN"] as const
export const PDF_DENSITIES = ["COMPACT", "BALANCED", "SPACIOUS"] as const

export const PDF_ACCENT_OPTIONS = [
  { value: "#3157d5", label: "Bleu signature" },
  { value: "#0f766e", label: "Sarcelle" },
  { value: "#9f1239", label: "Bordeaux" },
  { value: "#92400e", label: "Cuivre" },
  { value: "#202630", label: "Encre" },
] as const

export type PdfTemplate = (typeof PDF_TEMPLATES)[number]
export type PdfDensity = (typeof PDF_DENSITIES)[number]

export type PdfLine = {
  label: string
  description?: string | null
  quantity: number
  unitPriceCents: number
  tvaRate: number
}

export type PdfDocument = {
  kind: "DEVIS" | "FACTURE"
  number: string
  object: string
  date: Date | string
  validUntil?: Date | string | null
  dueDate?: Date | string | null
  totalHtCents: number
  totalTvaCents: number
  totalTtcCents: number
  lines: PdfLine[]
  client: {
    name: string
    address?: string | null
    siret?: string | null
    tvaNumber?: string | null
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
    iban?: string | null
    isTvaApplicable: boolean
    latePenaltyRate?: number | null
    brandColor?: string | null
    pdfTemplate?: string | null
  }
}

export type PdfRenderOptions = {
  template?: PdfTemplate | string | null
  accentColor?: string | null
  density?: PdfDensity | string | null
  showPayment?: boolean
  showReference?: boolean
  previewFit?: boolean
}

type RenderSettings = {
  template: PdfTemplate
  primary: string
  density: PdfDensity
  showPayment: boolean
  showReference: boolean
  previewFit: boolean
}

const densityConfig: Record<
  PdfDensity,
  { pageTop: string; pageInline: string; pageBottom: string; rowPadding: string; fontSize: string }
> = {
  COMPACT: {
    pageTop: "8.5mm",
    pageInline: "11mm",
    pageBottom: "17mm",
    rowPadding: "5px 6px",
    fontSize: "9.25pt",
  },
  BALANCED: {
    pageTop: "10mm",
    pageInline: "12.5mm",
    pageBottom: "18mm",
    rowPadding: "6.5px 7px",
    fontSize: "9.65pt",
  },
  SPACIOUS: {
    pageTop: "12mm",
    pageInline: "14mm",
    pageBottom: "19mm",
    rowPadding: "8px 8px",
    fontSize: "10pt",
  },
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function formatRate(rate: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(rate)
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
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

function formatQuantity(quantity: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(quantity)
}

function isValidHexColor(color: string | null | undefined) {
  return !!color && /^#[0-9a-f]{6}$/i.test(color.trim())
}

function normalizeHexColor(color: string | null | undefined, fallback = "#3157d5") {
  if (!color) return fallback
  const trimmed = color.trim()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, red, green, blue] = trimmed
    return `#${red}${red}${green}${green}${blue}${blue}`
  }
  return fallback
}

function toRgb(hex: string) {
  const value = Number.parseInt(normalizeHexColor(hex).slice(1), 16)
  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  }
}

function rgba(hex: string, alpha: number) {
  const color = toRgb(hex)
  return `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha})`
}

function safeImageSource(source: string | null | undefined) {
  if (!source) return null
  const trimmed = source.trim()
  if (/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) return trimmed
  if (/^https?:\/\/[^\s]+$/i.test(trimmed)) return trimmed
  return null
}

export function normalizePdfTemplate(template: string | null | undefined): PdfTemplate {
  const candidate = template?.toUpperCase()
  return PDF_TEMPLATES.includes(candidate as PdfTemplate) ? (candidate as PdfTemplate) : "MINIMAL"
}

export function normalizePdfDensity(density: string | null | undefined): PdfDensity {
  const candidate = density?.toUpperCase()
  return PDF_DENSITIES.includes(candidate as PdfDensity) ? (candidate as PdfDensity) : "BALANCED"
}

export function parsePdfRenderOptions(
  searchParams: URLSearchParams,
  fallbackTemplate?: string | null
): PdfRenderOptions {
  const accent = searchParams.get("accent")

  return {
    template: normalizePdfTemplate(searchParams.get("template") ?? fallbackTemplate),
    accentColor: isValidHexColor(accent) ? accent : null,
    density: normalizePdfDensity(searchParams.get("density")),
    showPayment: searchParams.get("payment") !== "0",
    showReference: searchParams.get("reference") !== "0",
  }
}

function resolveSettings(
  doc: PdfDocument,
  options?: PdfRenderOptions | PdfTemplate | string | null
): RenderSettings {
  const optionObject = typeof options === "string" ? { template: options } : options ?? {}
  const template = normalizePdfTemplate(optionObject.template ?? doc.company.pdfTemplate)
  const companyAccent = normalizeHexColor(doc.company.brandColor)

  return {
    template,
    primary: normalizeHexColor(optionObject.accentColor, companyAccent),
    density: normalizePdfDensity(optionObject.density),
    showPayment: optionObject.showPayment ?? true,
    showReference: optionObject.showReference ?? true,
    previewFit: optionObject.previewFit ?? false,
  }
}

function lineTotalCents(line: PdfLine) {
  return Math.round(line.quantity * line.unitPriceCents)
}

function documentTitle(doc: PdfDocument) {
  return doc.kind === "FACTURE" ? "Facture" : "Devis"
}

function documentLabel(doc: PdfDocument) {
  return doc.kind === "FACTURE" ? "FACTURE" : "DEVIS"
}

function documentDueDate(doc: PdfDocument) {
  return doc.kind === "FACTURE" ? doc.dueDate : doc.validUntil
}

function dueLabel(doc: PdfDocument) {
  return doc.kind === "FACTURE" ? "&Eacute;ch&eacute;ance" : "Validit&eacute;"
}

function documentDescriptor(doc: PdfDocument) {
  return doc.kind === "FACTURE" ? "Document de facturation" : "Proposition commerciale"
}

function recipientLabel(doc: PdfDocument) {
  return doc.kind === "FACTURE" ? "Factur&eacute; &agrave;" : "Destinataire"
}

function amountCaption(doc: PdfDocument) {
  return doc.kind === "FACTURE" ? "Montant &agrave; r&eacute;gler" : "Budget propos&eacute;"
}

function tvaFranchiseMention(doc: PdfDocument) {
  const documentDate = new Date(doc.date)
  const cibisStartDate = new Date("2026-09-01T00:00:00.000Z")

  if (documentDate >= cibisStartDate) {
    return "TVA non applicable, art. L. 223 et s. du code des impositions sur les biens et services (CIBS)."
  }

  return "TVA non applicable, article 293 B du CGI."
}

function companyMetaItems(doc: PdfDocument) {
  return [
    doc.company.address ? escapeHtml(doc.company.address).replace(/\r?\n/g, " &middot; ") : "",
    doc.company.email ? escapeHtml(doc.company.email) : "",
    doc.company.phone ? escapeHtml(doc.company.phone) : "",
    doc.company.siret ? `SIRET ${escapeHtml(doc.company.siret)}` : "",
    doc.company.tvaNumber ? `TVA ${escapeHtml(doc.company.tvaNumber)}` : "",
  ].filter(Boolean)
}

function companyLegalItems(doc: PdfDocument) {
  return [
    escapeHtml(doc.company.name),
    doc.company.fullName ? escapeHtml(doc.company.fullName) : "",
    doc.company.siret ? `SIRET ${escapeHtml(doc.company.siret)}` : "",
    doc.company.apeCode ? `APE ${escapeHtml(doc.company.apeCode)}` : "",
    doc.company.rcsNumber ? `RCS ${escapeHtml(doc.company.rcsNumber)}` : "",
    doc.company.tvaNumber ? `TVA ${escapeHtml(doc.company.tvaNumber)}` : "",
    doc.company.email ? escapeHtml(doc.company.email) : "",
  ].filter(Boolean)
}

function clientMeta(doc: PdfDocument) {
  return [
    doc.client.address ? withLineBreaks(doc.client.address) : "",
    doc.client.siret ? `SIRET ${escapeHtml(doc.client.siret)}` : "",
    doc.client.tvaNumber ? `TVA ${escapeHtml(doc.client.tvaNumber)}` : "",
  ].filter(Boolean)
}

function brandIdentity(doc: PdfDocument, className: string) {
  const logo = safeImageSource(doc.company.logo)
  const meta = companyMetaItems(doc)

  return `
    <div class="brand-lockup ${className}">
      ${logo ? `<img class="brand-logo" src="${escapeHtml(logo)}" alt="">` : ""}
      <div>
        <div class="brand-name">${escapeHtml(doc.company.name)}</div>
        ${meta.length ? `<div class="brand-meta">${meta.join(" &middot; ")}</div>` : ""}
      </div>
    </div>
  `
}

function compactMeta(label: string, value: string, className = "") {
  return `
    <div class="meta-item ${className}">
      <div class="label">${label}</div>
      <div class="meta-value numeric">${value}</div>
    </div>
  `
}

function linesTable(doc: PdfDocument, className: string) {
  const rows = doc.lines
    .map(
      (line) => `
        <tr>
          <td>
            <div class="line-title">${escapeHtml(line.label)}</div>
            ${line.description ? `<div class="line-desc">${withLineBreaks(line.description)}</div>` : ""}
          </td>
          <td class="num numeric">${formatQuantity(line.quantity)}</td>
          <td class="num numeric">${formatEuro(line.unitPriceCents)}</td>
          <td class="num numeric">${formatRate(line.tvaRate)}%</td>
          <td class="num numeric line-total">${formatEuro(lineTotalCents(line))}</td>
        </tr>
      `
    )
    .join("")

  return `
    <table class="line-table ${className}">
      <colgroup>
        <col class="line-description-column">
        <col class="line-quantity-column">
        <col class="line-price-column">
        <col class="line-tax-column">
        <col class="line-total-column">
      </colgroup>
      <thead>
        <tr>
          <th>Prestations</th>
          <th class="num">Qt&eacute;</th>
          <th class="num">PU HT</th>
          <th class="num">TVA</th>
          <th class="num">Total HT</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

function totalsPanel(doc: PdfDocument) {
  return `
    <aside class="totals-panel keep-together">
      <div class="totals-heading">R&eacute;capitulatif</div>
      <div class="totals-row"><span>Total HT</span><strong class="numeric">${formatEuro(doc.totalHtCents)}</strong></div>
      <div class="totals-row"><span>TVA</span><strong class="numeric">${formatEuro(doc.totalTvaCents)}</strong></div>
      <div class="totals-row totals-grand"><span>Total TTC</span><strong class="numeric">${formatEuro(doc.totalTtcCents)}</strong></div>
    </aside>
  `
}

function paymentPanel(doc: PdfDocument, settings: RenderSettings) {
  if (doc.kind === "DEVIS") {
    return `
      <section class="action-panel approval-panel keep-together">
        <div class="label">Acceptation</div>
        <p class="action-title">Bon pour accord</p>
        <p class="action-copy">La signature confirme le p&eacute;rim&egrave;tre, le montant et les conditions de la proposition.</p>
        ${settings.showReference ? `<p class="reference-line">R&eacute;f&eacute;rence <strong class="numeric">${escapeHtml(doc.number)}</strong></p>` : ""}
        <div class="approval-fields">
          <span>Date</span>
          <span>Nom, qualit&eacute; et signature</span>
        </div>
      </section>
    `
  }

  if (!settings.showPayment) {
    if (!settings.showReference) return ""

    return `
      <section class="action-panel reference-panel keep-together">
        <div class="label">R&eacute;f&eacute;rence de paiement</div>
        <p class="action-title numeric">${escapeHtml(doc.number)}</p>
        <p class="action-copy">&Agrave; rappeler avec votre r&egrave;glement.</p>
      </section>
    `
  }

  return `
    <section class="action-panel payment-panel keep-together">
      <div class="label">Modalit&eacute;s de r&egrave;glement</div>
      <p class="action-title">${doc.company.iban ? "Virement bancaire" : "Conditions convenues"}</p>
      ${
        doc.company.iban
          ? `<div class="iban numeric">${escapeHtml(doc.company.iban)}</div>`
          : '<p class="action-copy">Utilisez le mode de paiement convenu avec le prestataire.</p>'
      }
      <div class="payment-details">
        ${settings.showReference ? `<span>R&eacute;f&eacute;rence <strong class="numeric">${escapeHtml(doc.number)}</strong></span>` : ""}
        ${doc.dueDate ? `<span>&Eacute;ch&eacute;ance <strong>${formatDate(doc.dueDate)}</strong></span>` : ""}
      </div>
    </section>
  `
}

function legalFooter(doc: PdfDocument, settings: RenderSettings) {
  const identity = companyLegalItems(doc)
  const latePenaltyRate =
    typeof doc.company.latePenaltyRate === "number" && Number.isFinite(doc.company.latePenaltyRate)
      ? `${formatRate(doc.company.latePenaltyRate)}% par an`
      : "le taux l&eacute;gal en vigueur"

  return `
    <footer>
      <div class="footer-top">
        <strong>${identity.join(" &middot; ")}</strong>
        ${settings.showReference ? `<span class="footer-reference numeric">${documentLabel(doc)} ${escapeHtml(doc.number)}</span>` : ""}
      </div>
      <div class="footer-legal">
        ${!doc.company.isTvaApplicable ? `<span><strong>${escapeHtml(tvaFranchiseMention(doc))}</strong></span>` : ""}
        <span>
          ${
            doc.kind === "FACTURE"
              ? `Aucun escompte pour paiement anticip&eacute;. P&eacute;nalit&eacute;s exigibles d&egrave;s le lendemain de l'&eacute;ch&eacute;ance au taux de ${latePenaltyRate}. Indemnit&eacute; forfaitaire de 40 &euro; pour frais de recouvrement.`
              : "Proposition valable sous r&eacute;serve de disponibilit&eacute; et de validation du p&eacute;rim&egrave;tre final."
          }
        </span>
      </div>
    </footer>
  `
}

function baseCss(settings: RenderSettings) {
  const primary = settings.primary
  const density = densityConfig[settings.density]

  return `
    @page { size: A4; margin: 0; }
    ${pdfFontFaceCss()}
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background: #ffffff;
      color: #202630;
      font-family: "Freelio Sans", Arial, sans-serif;
      font-size: ${density.fontSize};
      font-variant-numeric: lining-nums tabular-nums;
      font-weight: 400;
      letter-spacing: 0;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      --page-inline: ${density.pageInline};
      background: #ffffff;
      min-height: 297mm;
      padding: ${density.pageTop} var(--page-inline) ${density.pageBottom};
      position: relative;
      width: 210mm;
    }
    @media screen {
      body { background: #dfe3e8; padding: 20px; }
      .page {
        box-shadow: 0 22px 48px rgba(30, 36, 48, 0.14);
        margin: 0 auto;
      }
    }
    ${
      settings.previewFit
        ? `
          @media screen {
            body { padding: 12px; }
            .page {
              max-width: calc(100vw - 24px);
              width: min(210mm, calc(100vw - 24px));
            }
          }
        `
        : ""
    }
    .document-main { min-height: 0; }
    .editorial { font-family: "Freelio Serif", Georgia, serif; }
    .accent { color: ${primary}; }
    .label {
      color: #697386;
      font-size: 7.15pt;
      font-weight: 700;
      letter-spacing: 0.035em;
      line-height: 1.2;
      text-transform: uppercase;
    }
    .numeric { font-variant-numeric: lining-nums tabular-nums; }
    .brand-lockup { align-items: flex-start; display: flex; gap: 8px; min-width: 0; }
    .brand-logo { display: block; height: 11mm; max-width: 35mm; object-fit: contain; object-position: left top; width: auto; }
    .brand-name { color: #1d232d; font-size: 14pt; font-weight: 700; line-height: 1.1; }
    .brand-meta { color: #667184; font-size: 7.8pt; line-height: 1.35; margin-top: 5px; max-width: 118mm; }
    table {
      border-collapse: collapse;
      page-break-inside: auto;
      table-layout: fixed;
      width: 100%;
    }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th {
      color: #657084;
      font-size: 6.9pt;
      font-weight: 700;
      letter-spacing: 0.025em;
      line-height: 1.2;
      padding: ${density.rowPadding};
      text-align: left;
      text-transform: uppercase;
    }
    td {
      border-bottom: 1px solid #e2e5e9;
      padding: ${density.rowPadding};
      vertical-align: top;
    }
    .line-description-column { width: 51%; }
    .line-quantity-column { width: 8%; }
    .line-price-column { width: 15%; }
    .line-tax-column { width: 9%; }
    .line-total-column { width: 17%; }
    .num { text-align: right; white-space: nowrap; }
    .line-title { color: #1e2530; font-weight: 650; line-height: 1.25; }
    .line-desc { color: #697386; font-size: 7.8pt; line-height: 1.35; margin-top: 2px; }
    .line-total { color: #1e2530; font-weight: 700; }
    .action-panel p { margin: 0; }
    .action-title { color: #1f2630; font-size: 10.5pt; font-weight: 700; margin-top: 4px !important; }
    .action-copy { color: #667184; font-size: 8.15pt; line-height: 1.4; margin-top: 4px !important; max-width: 78mm; }
    .reference-line { color: #4f5968; font-size: 7.8pt; margin-top: 5px !important; }
    .iban { color: #202630; font-size: 8.4pt; font-weight: 650; margin-top: 4px; overflow-wrap: anywhere; }
    .approval-fields {
      color: #697386;
      display: grid;
      font-size: 7.2pt;
      gap: 7mm;
      grid-template-columns: 32mm minmax(0, 1fr);
      margin-top: 5mm;
    }
    .approval-fields span { border-top: 1px solid #aeb6c2; padding-top: 3px; }
    .payment-details { color: #667184; display: flex; flex-wrap: wrap; font-size: 7.6pt; gap: 3px 7mm; margin-top: 6px; }
    .totals-heading { color: #697386; font-size: 7.15pt; font-weight: 700; letter-spacing: 0.035em; margin-bottom: 4px; text-transform: uppercase; }
    .totals-row { align-items: baseline; color: #566171; display: flex; gap: 12px; justify-content: space-between; padding: 4px 0; }
    .totals-row strong { color: #202630; font-weight: 650; }
    .totals-grand { border-top: 1.5px solid ${primary}; color: #202630; font-size: 14pt; margin-top: 5px; padding-top: 8px; }
    .totals-grand strong { font-weight: 700; }
    footer {
      background: #ffffff;
      border-top: 1px solid #d9dde3;
      color: #687284;
      font-size: 6.25pt;
      line-height: 1.3;
      margin-top: 6mm;
      padding-top: 2.5mm;
    }
    .footer-top { align-items: baseline; color: #313946; display: grid; gap: 8mm; grid-template-columns: minmax(0, 1fr) auto; }
    .footer-top strong { font-weight: 600; }
    .footer-reference { font-weight: 650; white-space: nowrap; }
    .footer-legal { display: flex; flex-wrap: wrap; gap: 1px 3mm; margin-top: 2px; }
    h1, h2, h3, p { orphans: 3; widows: 3; }
    h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
    .keep-together { break-inside: avoid; page-break-inside: avoid; }
    .minimal-closing > .totals-panel:only-child,
    .professional-settlement > .totals-panel:only-child,
    .modern-closing > .totals-panel:only-child { grid-column: 2; }
    @media print {
      body { background: #ffffff; }
      .page { box-shadow: none; }
      footer {
        bottom: 5.5mm;
        left: var(--page-inline);
        margin: 0;
        position: fixed;
        right: var(--page-inline);
      }
    }
  `
}

function renderMinimal(doc: PdfDocument, settings: RenderSettings) {
  const primary = settings.primary
  const due = documentDueDate(doc)
  const client = clientMeta(doc)

  return `
    <style>
      ${baseCss(settings)}
      .minimal-page { border-top: 1.6mm solid ${primary}; color: #1f242c; }
      .minimal-header {
        align-items: start;
        border-bottom: 1px solid #cfd4da;
        display: grid;
        gap: 12mm;
        grid-template-columns: minmax(0, 1fr) auto;
        padding-bottom: 4mm;
      }
      .minimal-document { min-width: 50mm; text-align: right; }
      .minimal-document-type { color: ${primary}; font-size: 7.3pt; font-weight: 700; letter-spacing: 0.035em; text-transform: uppercase; }
      .minimal-document-number { color: #1c222b; font-size: 12pt; font-weight: 700; margin-top: 4px; }
      .minimal-lead {
        align-items: end;
        display: grid;
        gap: 11mm;
        grid-template-columns: minmax(0, 1fr) 57mm;
        padding: 6mm 0 5mm;
      }
      .minimal-lead h1 {
        color: #171b22;
        font-size: 20.5pt;
        font-weight: 560;
        letter-spacing: -0.015em;
        line-height: 1.12;
        margin: 4px 0 0;
        overflow-wrap: anywhere;
      }
      .minimal-amount { border-top: 1px solid #aeb5bf; padding-top: 3mm; }
      .minimal-amount strong { color: #171b22; display: block; font-size: 19pt; font-weight: 560; line-height: 1; margin-top: 5px; white-space: nowrap; }
      .minimal-amount-note { color: #697386; font-size: 7.25pt; margin-top: 5px; }
      .minimal-information {
        border-bottom: 1px solid #cfd4da;
        border-top: 1px solid #cfd4da;
        display: grid;
        grid-template-columns: minmax(0, 1.45fr) minmax(34mm, 0.72fr) minmax(34mm, 0.72fr);
      }
      .minimal-information > div { min-width: 0; padding: 3.7mm 5mm; }
      .minimal-information > div:first-child { padding-left: 0; }
      .minimal-information > div + div { border-left: 1px solid #e0e3e7; }
      .recipient-name { color: #1c222b; font-size: 11.3pt; font-weight: 700; line-height: 1.2; margin-top: 4px; }
      .recipient-meta { color: #667184; font-size: 8pt; line-height: 1.4; margin-top: 4px; }
      .minimal-information .meta-value { color: #232a35; font-size: 9pt; font-weight: 650; line-height: 1.3; margin-top: 4px; }
      .minimal-lines { margin-top: 5.5mm; }
      .minimal-lines thead th { border-bottom: 1.5px solid #242a33; border-top: 1px solid #242a33; color: #303744; }
      .minimal-lines th:first-child, .minimal-lines td:first-child { padding-left: 0; }
      .minimal-lines th:last-child, .minimal-lines td:last-child { padding-right: 0; }
      .minimal-lines tbody tr:last-child td { border-bottom-color: #242a33; }
      .minimal-closing { align-items: start; display: grid; gap: 12mm; grid-template-columns: minmax(0, 1fr) 65mm; margin-top: 5.5mm; }
      .minimal-closing .action-panel { border-top: 1px solid #242a33; padding-top: 3mm; }
      .minimal-closing .totals-panel { border-top: 2px solid ${primary}; padding-top: 3mm; }
      .minimal-closing .totals-grand { font-family: "Freelio Serif", Georgia, serif; font-weight: 560; }
    </style>
    <div class="page minimal-page" data-template="minimal" data-document-kind="${doc.kind.toLowerCase()}">
      <main class="document-main">
        <header class="minimal-header">
          ${brandIdentity(doc, "minimal-brand")}
          <div class="minimal-document">
            <div class="minimal-document-type">${documentDescriptor(doc)}</div>
            <div class="minimal-document-number numeric">${documentLabel(doc)} ${escapeHtml(doc.number)}</div>
          </div>
        </header>

        <section class="minimal-lead keep-together">
          <div>
            <div class="label accent">Objet de la mission</div>
            <h1 class="editorial">${escapeHtml(doc.object)}</h1>
          </div>
          <div class="minimal-amount">
            <div class="label">${amountCaption(doc)}</div>
            <strong class="editorial numeric">${formatEuro(doc.totalTtcCents)}</strong>
            <div class="minimal-amount-note">Toutes taxes comprises</div>
          </div>
        </section>

        <section class="minimal-information keep-together">
          <div>
            <div class="label">${recipientLabel(doc)}</div>
            <div class="recipient-name">${escapeHtml(doc.client.name)}</div>
            ${client.length ? `<div class="recipient-meta">${client.join("<br>")}</div>` : ""}
          </div>
          ${compactMeta("Date d'&eacute;mission", formatDate(doc.date))}
          ${compactMeta(dueLabel(doc), due ? formatDate(due) : "Non pr&eacute;cis&eacute;e")}
        </section>

        ${linesTable(doc, "minimal-lines")}

        <section class="minimal-closing">
          ${paymentPanel(doc, settings)}
          ${totalsPanel(doc)}
        </section>
      </main>

      ${legalFooter(doc, settings)}
    </div>
  `
}

function renderProfessional(doc: PdfDocument, settings: RenderSettings) {
  const primary = settings.primary
  const due = documentDueDate(doc)
  const client = clientMeta(doc)

  return `
    <style>
      ${baseCss(settings)}
      .professional-page { color: #202733; }
      .professional-rule { background: ${primary}; height: 2.5px; width: 20mm; }
      .professional-masthead {
        align-items: start;
        border-bottom: 1px solid #bfc6d0;
        display: grid;
        gap: 12mm;
        grid-template-columns: minmax(0, 1fr) 61mm;
        padding: 4mm 0 4.5mm;
      }
      .professional-document { text-align: right; }
      .professional-document-caption { color: ${primary}; font-size: 7.2pt; font-weight: 700; letter-spacing: 0.035em; text-transform: uppercase; }
      .professional-document-type { color: #1b222c; font-size: 23pt; font-weight: 700; line-height: 0.95; margin-top: 4px; }
      .professional-number { color: #525d6d; font-size: 9.3pt; font-weight: 600; margin-top: 6px; }
      .professional-overview {
        border: 1px solid #cfd5dd;
        border-top: 2.5px solid ${primary};
        display: grid;
        grid-template-columns: 63mm minmax(0, 1fr);
        margin-top: 5mm;
      }
      .professional-client { background: #f2f4f6; border-right: 1px solid #d7dce3; padding: 4.5mm; }
      .professional-client-name { color: #1c232d; font-size: 11.8pt; font-weight: 700; line-height: 1.2; margin-top: 4px; }
      .professional-client-meta { color: #667184; font-size: 7.9pt; line-height: 1.42; margin-top: 5px; }
      .professional-overview-main { min-width: 0; }
      .professional-meta-grid { border-bottom: 1px solid #d7dce3; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .professional-meta-grid .meta-item { min-width: 0; padding: 3.5mm 4mm; }
      .professional-meta-grid .meta-item + .meta-item { border-left: 1px solid #e0e3e8; }
      .professional-meta-grid .meta-value { color: #252d39; font-size: 8.8pt; font-weight: 650; line-height: 1.25; margin-top: 4px; }
      .professional-meta-grid .amount-meta .meta-value { color: ${primary}; font-size: 11.2pt; }
      .professional-subject { padding: 4mm; }
      .professional-subject h1 { color: #1b222c; font-size: 14pt; font-weight: 650; line-height: 1.25; margin: 4px 0 0; overflow-wrap: anywhere; }
      .professional-lines { border: 1px solid #cfd5dd; border-top: 2.5px solid #202733; margin-top: 5.5mm; }
      .professional-lines thead th { background: #edf0f3; border-bottom: 1px solid #c7ced7; color: #2d3541; }
      .professional-lines td { border-bottom-color: #dfe3e8; }
      .professional-lines tbody tr:last-child td { border-bottom: 0; }
      .professional-settlement { align-items: start; display: grid; gap: 9mm; grid-template-columns: minmax(0, 1fr) 68mm; margin-top: 5.5mm; }
      .professional-settlement .action-panel { background: #f4f6f8; border-bottom: 1px solid #d5dae1; border-top: 1px solid #b9c1cb; padding: 3.5mm 4mm; }
      .professional-settlement .totals-panel { border: 1px solid #bfc6d0; border-top: 3px solid ${primary}; padding: 3mm 3.5mm 0; }
      .professional-settlement .totals-grand { background: #202733; border: 0; color: #ffffff; margin: 5px -3.5mm 0; padding: 8px 3.5mm; }
      .professional-settlement .totals-grand strong { color: #ffffff; }
    </style>
    <div class="page professional-page" data-template="professional" data-document-kind="${doc.kind.toLowerCase()}">
      <main class="document-main">
        <div class="professional-rule"></div>
        <header class="professional-masthead">
          ${brandIdentity(doc, "professional-brand")}
          <div class="professional-document">
            <div class="professional-document-caption">${documentDescriptor(doc)}</div>
            <div class="professional-document-type">${documentLabel(doc)}</div>
            <div class="professional-number numeric">N&deg; ${escapeHtml(doc.number)}</div>
          </div>
        </header>

        <section class="professional-overview keep-together">
          <div class="professional-client">
            <div class="label">${recipientLabel(doc)}</div>
            <div class="professional-client-name">${escapeHtml(doc.client.name)}</div>
            ${client.length ? `<div class="professional-client-meta">${client.join("<br>")}</div>` : ""}
          </div>
          <div class="professional-overview-main">
            <div class="professional-meta-grid">
              ${compactMeta("&Eacute;mission", formatDate(doc.date))}
              ${compactMeta(dueLabel(doc), due ? formatDate(due) : "Non pr&eacute;cis&eacute;e")}
              ${compactMeta(amountCaption(doc), formatEuro(doc.totalTtcCents), "amount-meta")}
            </div>
            <div class="professional-subject">
              <div class="label accent">Objet</div>
              <h1>${escapeHtml(doc.object)}</h1>
            </div>
          </div>
        </section>

        ${linesTable(doc, "professional-lines")}

        <section class="professional-settlement">
          ${paymentPanel(doc, settings)}
          ${totalsPanel(doc)}
        </section>
      </main>

      ${legalFooter(doc, settings)}
    </div>
  `
}

function renderModern(doc: PdfDocument, settings: RenderSettings) {
  const primary = settings.primary
  const due = documentDueDate(doc)
  const client = clientMeta(doc)
  const density = densityConfig[settings.density]
  const gutter = settings.density === "COMPACT" ? "12mm" : settings.density === "SPACIOUS" ? "16mm" : "14mm"

  return `
    <style>
      ${baseCss(settings)}
      .modern-page { --page-inline: ${gutter}; padding: 0 0 ${density.pageBottom}; }
      .modern-hero { background: ${rgba(primary, 0.06)}; border-top: 3mm solid ${primary}; padding: 6mm ${gutter} 5.5mm; }
      .modern-topline { align-items: start; display: flex; gap: 10mm; justify-content: space-between; }
      .modern-topline .brand-name { font-size: 12.5pt; }
      .modern-reference { border-bottom: 2px solid ${primary}; min-width: 47mm; padding-bottom: 3mm; text-align: right; }
      .modern-reference strong { color: #1c232d; display: block; font-size: 10pt; margin-top: 3px; }
      .modern-composition { align-items: end; display: grid; gap: 11mm; grid-template-columns: minmax(0, 1fr) 61mm; margin-top: 5mm; }
      .modern-document-type { align-items: center; color: ${primary}; display: flex; font-size: 7.5pt; font-weight: 700; gap: 7px; letter-spacing: 0.035em; text-transform: uppercase; }
      .modern-document-type::before { background: ${primary}; content: ""; height: 6px; width: 6px; }
      .modern-composition h1 { color: #171d26; font-size: 19.5pt; font-weight: 650; letter-spacing: -0.018em; line-height: 1.12; margin: 5px 0 0; max-width: 110mm; overflow-wrap: anywhere; }
      .modern-amount { background: #202733; border-top: 3px solid ${primary}; color: #ffffff; padding: 4mm 4.5mm; }
      .modern-amount .label { color: rgba(255, 255, 255, 0.68); }
      .modern-amount strong { display: block; font-size: 18.5pt; font-weight: 700; line-height: 1; margin-top: 5px; white-space: nowrap; }
      .modern-amount span { color: rgba(255, 255, 255, 0.72); display: block; font-size: 7.2pt; margin-top: 5px; }
      .modern-facts { border-top: 1px solid ${rgba(primary, 0.22)}; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 4.5mm; padding-top: 3.5mm; }
      .modern-facts .meta-item { min-width: 0; padding-right: 5mm; }
      .modern-facts .meta-item + .meta-item { border-left: 1px solid ${rgba(primary, 0.18)}; padding-left: 5mm; }
      .modern-facts .meta-value { color: #252d39; font-size: 8.9pt; font-weight: 650; line-height: 1.25; margin-top: 4px; }
      .modern-content { padding: 5.5mm ${gutter} 0; }
      .modern-recipient { border-bottom: 1px solid #d8dde4; display: grid; gap: 7mm; grid-template-columns: 34mm minmax(0, 1fr); margin-bottom: 5mm; padding-bottom: 4mm; }
      .modern-recipient-name { color: #1b222c; font-size: 11.7pt; font-weight: 700; line-height: 1.2; }
      .modern-recipient-meta { color: #667184; font-size: 7.9pt; line-height: 1.4; margin-top: 4px; }
      .modern-lines { border: 1px solid #d4d9e0; border-radius: 6px; border-spacing: 0; overflow: hidden; }
      .modern-lines thead th { background: #202733; border: 0; color: #ffffff; }
      .modern-lines tbody tr:nth-child(even) td { background: #f6f7f9; }
      .modern-lines tbody tr:last-child td { border-bottom: 0; }
      .modern-closing { align-items: start; display: grid; gap: 9mm; grid-template-columns: minmax(0, 1fr) 69mm; margin-top: 5.5mm; }
      .modern-closing .action-panel { background: ${rgba(primary, 0.035)}; border: 1px solid ${rgba(primary, 0.22)}; border-radius: 6px; padding: 3.5mm 4mm; }
      .modern-closing .totals-panel { border: 1px solid #cfd5dd; border-radius: 6px; border-top: 3px solid ${primary}; padding: 3mm 3.5mm; }
      .modern-closing .totals-grand { color: ${primary}; }
    </style>
    <div class="page modern-page" data-template="modern" data-document-kind="${doc.kind.toLowerCase()}">
      <main class="document-main">
        <header class="modern-hero">
          <div class="modern-topline">
            ${brandIdentity(doc, "modern-brand")}
            <div class="modern-reference">
              <div class="label">${documentLabel(doc)}</div>
              <strong class="numeric">${escapeHtml(doc.number)}</strong>
            </div>
          </div>

          <div class="modern-composition">
            <div>
              <div class="modern-document-type">${documentDescriptor(doc)}</div>
              <h1>${escapeHtml(doc.object)}</h1>
            </div>
            <div class="modern-amount">
              <div class="label">${amountCaption(doc)}</div>
              <strong class="numeric">${formatEuro(doc.totalTtcCents)}</strong>
              <span>Toutes taxes comprises</span>
            </div>
          </div>

          <div class="modern-facts">
            ${compactMeta("Date d'&eacute;mission", formatDate(doc.date))}
            ${compactMeta(dueLabel(doc), due ? formatDate(due) : "Non pr&eacute;cis&eacute;e")}
            ${compactMeta("Total hors taxes", formatEuro(doc.totalHtCents))}
          </div>
        </header>

        <div class="modern-content">
          <section class="modern-recipient keep-together">
            <div class="label">${recipientLabel(doc)}</div>
            <div>
              <div class="modern-recipient-name">${escapeHtml(doc.client.name)}</div>
              ${client.length ? `<div class="modern-recipient-meta">${client.join("<br>")}</div>` : ""}
            </div>
          </section>

          ${linesTable(doc, "modern-lines")}

          <section class="modern-closing">
            ${paymentPanel(doc, settings)}
            ${totalsPanel(doc)}
          </section>
        </div>
      </main>

      ${legalFooter(doc, settings)}
    </div>
  `
}

export function renderDocumentHtml(
  doc: PdfDocument,
  options?: PdfRenderOptions | PdfTemplate | string | null
): string {
  const settings = resolveSettings(doc, options)
  const body =
    settings.template === "PROFESSIONAL"
      ? renderProfessional(doc, settings)
      : settings.template === "MODERN"
        ? renderModern(doc, settings)
        : renderMinimal(doc, settings)

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(documentTitle(doc))} ${escapeHtml(doc.number)}</title>
</head>
<body>
${body}
</body>
</html>`
}
