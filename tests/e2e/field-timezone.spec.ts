import { expect, test } from "@playwright/test"
import { createDatabaseClient } from "@/lib/database-client"

test.use({ timezoneId: "Pacific/Kiritimati" })
const database = createDatabaseClient()
test.afterAll(async () => { await database.$disconnect() })

test("field assignments keep the company time zone without a hydration mismatch", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:")) throw new Error("Cette recette exige la base SQLite fictive isolée")
  const site = await database.customerSite.findFirstOrThrow({ where: { companyId: "ce2ecompany000000000000001" } })
  const assignment = await database.fieldIntervention.create({
    data: { companyId: site.companyId, siteId: site.id, title: `Fictional timezone ${info.project.name}`, type: "SAV", status: "PLANNED", scheduledStart: new Date("2026-10-25T23:30:00.000Z") },
    include: { company: { select: { serviceTimezone: true } } },
  })
  try {
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    await page.goto("/dashboard/terrain")
    await expect(page.getByRole("heading", { name: "Terrain hors ligne", exact: true })).toBeVisible()
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: assignment.title, exact: true }) })
    const expectedDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: assignment.company.serviceTimezone }).format(assignment.scheduledStart)
    await expect(card).toContainText(expectedDate)
    await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
    await expect(card.getByLabel("Compte rendu terrain", { exact: true })).toBeEditable()
    expect(errors).toEqual([])
  } finally {
    await database.fieldIntervention.delete({ where: { id: assignment.id } })
  }
})
