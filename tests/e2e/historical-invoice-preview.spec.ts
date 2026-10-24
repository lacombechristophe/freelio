import { PrismaClient } from "@prisma/client"
import { expect, test } from "@playwright/test"

test("an issued invoice without its historical archive stays readable without regenerating a PDF", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette Archive historique exige une SQLite fictive isolée")
  const database = new PrismaClient()
  try {
    const invoice = await database.invoice.findUniqueOrThrow({
      where: { companyId_number: { companyId: "ce2ecompany000000000000001", number: `UIQA-HISTORICAL-${info.project.name}` } },
    })
    expect(invoice).toMatchObject({ status: "SENT", issuedDocument: null, pdfUrl: null, pdfHash: null })
    expect(invoice.lockedAt).not.toBeNull()
    expect(invoice.dueDate.getTime()).toBeGreaterThan(Date.now())
    const lines = await database.invoiceLine.findMany({ where: { invoiceId: invoice.id }, orderBy: { id: "asc" } })
    const audits = await database.auditLog.findMany({ where: { resourceId: invoice.id }, orderBy: { id: "asc" } })
    const errors: string[] = [], pdfRequests: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    page.on("request", request => { if (new URL(request.url()).pathname === `/api/pdf/facture/${invoice.id}`) pdfRequests.push(request.url()) })

    await page.goto(`/dashboard/factures/${invoice.id}`)
    await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
    const studio = page.locator("#document-studio")
    await expect(studio.getByText("Archive historique indisponible", { exact: true })).toBeVisible()
    await expect(studio.getByText("Le document d’origine doit être récupéré ; il ne sera pas régénéré.", { exact: true })).toBeVisible()
    await expect(studio.locator("iframe")).toHaveCount(0)
    await expect(studio.getByRole("button", { name: "Plein écran", exact: true })).toBeDisabled()
    await expect(studio.getByRole("button", { name: `Télécharger ${invoice.number}`, exact: true })).toBeDisabled()
    await expect(studio.locator('a[href*="/api/pdf/"]')).toHaveCount(0)
    const presentation = studio.locator("summary").filter({ hasText: "Mise en page ·" })
    await expect(presentation).toHaveCount(1)
    await presentation.click()
    await expect(studio.locator("button")).toHaveCount(5)
    for (const button of await studio.locator("button").all()) await expect(button).toBeDisabled()
    await expect(studio.getByRole("switch")).toHaveCount(2)
    for (const control of await studio.getByRole("switch").all()) await expect(control).toBeDisabled()
    expect(pdfRequests).toEqual([])

    for (const suffix of ["", "?screen=1"]) {
      const response = await page.request.get(`/api/pdf/facture/${invoice.id}${suffix}`)
      expect(response.status()).toBe(409)
      expect(await response.json()).toEqual({ error: "L’archive de cette facture émise est absente ou invalide. Une récupération contrôlée est nécessaire ; le document n’a pas été régénéré." })
    }
    expect(await database.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toEqual(invoice)
    expect(await database.invoiceLine.findMany({ where: { invoiceId: invoice.id }, orderBy: { id: "asc" } })).toEqual(lines)
    expect(await database.auditLog.findMany({ where: { resourceId: invoice.id }, orderBy: { id: "asc" } })).toEqual(audits)
    expect(errors).toEqual([])
  } finally { await database.$disconnect() }
})
