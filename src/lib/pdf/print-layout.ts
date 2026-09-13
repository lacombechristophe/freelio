/** Reserve repeating page margins; keep legal details in the document flow. */
export function documentPrintCss(reference: string, top: string, bottom: string) {
  // CSS string context, inside an HTML style element (not HTML text context).
  const label = JSON.stringify(reference.replace(/[\u0000-\u0020]+/g, " ").trim())
    .replaceAll("<", "\\3c ")

  return `
    @media print {
      @page {
        margin: ${top} 0 ${bottom};
        @bottom-center {
          content: ${label} ${reference ? '" · "' : '""'} "Page " counter(page) " / " counter(pages);
          color: #687284;
          font: 6.5pt Arial, sans-serif;
          padding: 0 12mm;
          vertical-align: middle;
          overflow-wrap: anywhere;
        }
      }
      body { background: #ffffff; }
      .page { box-shadow: none; min-height: 0; padding-top: 0; padding-bottom: 0; }
      footer { break-inside: avoid; page-break-inside: avoid; }
    }
  `
}
