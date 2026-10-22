import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { expect, test } from "@playwright/test"

const database = new PrismaClient()
test.afterAll(async () => { await database.$disconnect() })

test("Commercial launches an accepted quote once and keeps input after a stale source", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette Conversion Devis exige une SQLite fictive isolée")
  const source = await database.user.findUniqueOrThrow({ where: { email: `purchase-creation-${info.project.name}@example.test` }, select: { passwordHash: true } })
  const company = await database.company.create({ data: { name: "Fictional quote conversion browser company" } })
  await database.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
  const email = `quote-conversion-${info.project.name}-${randomUUID()}@example.test`
  const user = await database.user.create({ data: { companyId: company.id, email, emailVerified: new Date(), passwordHash: source.passwordHash } })
  const membership = await database.membership.create({ data: { companyId: company.id, userId: user.id, role: "SALES", status: "ACTIVE" } })
  const agency = await database.agency.create({ data: { companyId: company.id, code: "CONVERT", name: "Fictional conversion browser agency" } })
  await database.agencyMembership.create({ data: { membershipId: membership.id, agencyId: agency.id } })
  const client = await database.client.create({ data: { companyId: company.id, name: "Fictional accepted quote browser client" } })
  const project = await database.project.create({ data: { companyId: company.id, clientId: client.id, agencyId: agency.id, name: "Fictional conversion browser project" } })
  const quote = await database.quote.create({ data: { companyId: company.id, clientId: client.id, projectId: project.id, number: "DEV-FICTIONAL-CONVERT", object: "Fictional accepted browser work", status: "ACCEPTED", currentVersion: 1,
    versions: { create: { version: 1, totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000,
      sections: { create: { lines: { create: { label: "Fictional browser quoted line", quantity: 1, unitPriceCents: 10000, tvaRate: 20 } } } },
    } },
  }, include: { versions: { include: { sections: { include: { lines: true } } } } } })
  const line = quote.versions[0].sections[0].lines[0]
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(email)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  await page.goto(`/dashboard/devis/${quote.id}`)
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
  await page.getByRole("button", { name: "Lancer le dossier", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Lancer le dossier accepté", exact: true })
  await dialog.getByLabel("Acompte prévu", { exact: true }).fill("45")
  await dialog.getByLabel("Pose souhaitée", { exact: true }).fill("2030-02-20")
  await dialog.getByRole("checkbox", { name: "Préparer aussi le contrat de fourniture et pose", exact: true }).uncheck()
  await database.quoteLine.update({ where: { id: line.id }, data: { description: "Fictional newer source description" } })
  await dialog.getByRole("button", { name: "Préparer le dossier", exact: true }).click()
  await expect(page.getByText("Le devis a changé. Rechargez la page puis réessayez ; votre saisie est conservée.", { exact: true })).toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel("Acompte prévu", { exact: true })).toHaveValue("45")
  await expect(dialog.getByLabel("Pose souhaitée", { exact: true })).toHaveValue("2030-02-20")
  expect(await database.customerOrder.count({ where: { quoteId: quote.id } })).toBe(0)
  expect(await database.auditLog.count({ where: { userId: user.id } })).toBe(0)
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click()
  await page.reload()
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
  await page.getByRole("button", { name: "Lancer le dossier", exact: true }).click()
  await dialog.getByLabel("Acompte prévu", { exact: true }).fill("45")
  await dialog.getByLabel("Pose souhaitée", { exact: true }).fill("2030-02-20")
  await dialog.getByRole("checkbox", { name: "Préparer aussi le contrat de fourniture et pose", exact: true }).uncheck()
  await dialog.getByRole("button", { name: "Préparer le dossier", exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("button", { name: "Lancer le dossier", exact: true })).toHaveCount(0)
  const orders = await database.customerOrder.findMany({ where: { quoteId: quote.id }, include: { lines: true } })
  expect(orders).toHaveLength(1)
  expect(orders[0]).toMatchObject({ projectId: project.id, totalTtcCents: 12000, depositCents: 5400, expectedInstallationAt: new Date("2030-02-20T12:00:00Z") })
  expect(orders[0].lines[0]).toMatchObject({ sourceKey: `quote:${line.id}`, description: "Fictional newer source description" })
  expect(await database.auditLog.count({ where: { userId: user.id, action: "CREATE_CUSTOMER_ORDER" } })).toBe(1)
  expect(await database.invoice.count({ where: { companyId: company.id } })).toBe(0)
  expect(await database.contract.count({ where: { companyId: company.id } })).toBe(0)
  expect(errors).toEqual([])
})
