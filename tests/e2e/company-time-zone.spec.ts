import { expect, test } from "@playwright/test"
import { createDatabaseClient } from "@/lib/database-client"
import { calendarDayKey, shiftCalendarDay } from "@/lib/calendar-days"

test.use({ timezoneId: "Pacific/Kiritimati" })
const database = createDatabaseClient()
test.afterAll(async () => { await database.$disconnect() })

test("company timestamps hydrate consistently while time-entry dates keep their calendar day", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:")) throw new Error("Cette recette exige la base SQLite fictive isolée")
  const company = await database.company.findUniqueOrThrow({ where: { id: "ce2ecompany000000000000001" } })
  const client = await database.client.findFirstOrThrow({ where: { companyId: company.id } })
  const tag = `timezone-${info.project.name}-${Date.now()}`
  const instant = new Date("2026-10-25T23:30:00.000Z")
  const timeZone = "America/New_York"
  const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone }).format(instant)
  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone }).format(instant)
  let leadId: string | undefined
  let threadId: string | undefined
  let articleId: string | undefined
  let projectId: string | undefined
  try {
    await database.company.update({ where: { id: company.id }, data: { serviceTimezone: timeZone } })
    leadId = (await database.leadCapture.create({ data: { companyId: company.id, firstName: tag, lastName: "Fictif", privacyAccepted: true, marketingOptIn: false, source: "MANUAL", fingerprint: tag, createdAt: instant } })).id
    threadId = (await database.emailThread.create({ data: { companyId: company.id, clientId: client.id, subject: tag, lastMessageAt: instant } })).id
    await database.emailMessage.create({ data: { companyId: company.id, threadId, direction: "INBOUND", provider: "DEMO", fromAddress: "timezone@example.test", toAddresses: ["qa-crm@example.com"], subject: tag, bodyText: tag, status: "RECEIVED", receivedAt: instant, createdAt: instant } })
    articleId = (await database.knowledgeArticle.create({ data: { companyId: company.id, title: tag, slug: tag, bodyHtml: "<p>Exemple fictif de fuseau horaire.</p>", status: "PUBLISHED", visibility: "INTERNAL", tags: [], updatedAt: instant } })).id
    projectId = (await database.project.create({ data: { companyId: company.id, clientId: client.id, name: tag, status: "ACTIVE" } })).id
    await database.timeEntry.create({ data: { projectId, date: new Date("2026-10-25T00:00:00.000Z"), durationSec: 60, isBillable: true, description: tag } })

    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    await page.goto("/dashboard/leads")
    await page.getByRole("textbox", { name: "Rechercher un prospect", exact: true }).fill(tag)
    const lead = page.getByRole("row").filter({ hasText: `${tag} Fictif` })
    await expect(lead).toContainText(dateTime)

    await page.goto("/dashboard/communications")
    await page.getByLabel("Recherche", { exact: true }).fill(tag)
    await page.getByRole("button", { name: "Rechercher", exact: true }).click()
    await page.getByRole("button").filter({ hasText: tag }).first().click()
    await expect(page.locator("#dashboard-main")).toContainText(dateTime)

    await page.goto("/dashboard/service/connaissance")
    await page.getByRole("textbox", { name: "Rechercher dans la base de connaissances", exact: true }).fill(tag)
    const article = page.locator('[data-slot="card"]').filter({ has: page.getByText(tag, { exact: true }) })
    await expect(article).toContainText(`mis à jour le ${date}`)

    await page.goto("/dashboard/factures/temps-non-facture")
    await expect(page.getByLabel("Échéance", { exact: true })).toHaveValue(shiftCalendarDay(calendarDayKey(new Date(), timeZone), 30))
    await page.locator("select").filter({ has: page.locator(`option[value="${projectId}"]`) }).selectOption(projectId)
    const timeEntry = page.locator("label").filter({ has: page.getByText(tag, { exact: true }) })
    await expect(timeEntry).toContainText("25 oct. 2026")
    expect(errors).toEqual([])
  } finally {
    await database.company.update({ where: { id: company.id }, data: { serviceTimezone: company.serviceTimezone } })
    if (threadId) {
      await database.emailMessage.deleteMany({ where: { threadId } })
      await database.emailThread.delete({ where: { id: threadId } })
    }
    if (leadId) await database.leadCapture.delete({ where: { id: leadId } })
    if (articleId) await database.knowledgeArticle.delete({ where: { id: articleId } })
    if (projectId) {
      await database.timeEntry.deleteMany({ where: { projectId } })
      await database.project.delete({ where: { id: projectId } })
    }
  }
})
