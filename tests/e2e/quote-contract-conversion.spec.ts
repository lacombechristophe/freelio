import { createDatabaseClient } from "@/lib/database-client"
import { randomUUID } from "node:crypto"
import { expect, test, type Page, type TestInfo } from "@playwright/test"

const database = createDatabaseClient()
test.afterAll(async () => { await database.$disconnect() })

async function openFictionalQuote(page: Page, info: TestInfo) {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette Contrat Devis exige une SQLite fictive isolée")
  const source = await database.user.findUniqueOrThrow({ where: { email: `purchase-creation-${info.project.name}@example.test` }, select: { passwordHash: true } })
  const company = await database.company.create({ data: { name: "Fictional quote contract browser company" } })
  await database.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
  const email = `quote-contract-${info.project.name}-${randomUUID()}@example.test`
  const user = await database.user.create({ data: { companyId: company.id, email, emailVerified: new Date(), passwordHash: source.passwordHash } })
  const membership = await database.membership.create({ data: { companyId: company.id, userId: user.id, role: "SALES", status: "ACTIVE" } })
  const agency = await database.agency.create({ data: { companyId: company.id, code: "CONTRACT", name: "Fictional contract browser agency" } })
  await database.agencyMembership.create({ data: { membershipId: membership.id, agencyId: agency.id } })
  const client = await database.client.create({ data: { companyId: company.id, name: "Fictional contract browser client" } })
  const project = await database.project.create({ data: { companyId: company.id, clientId: client.id, agencyId: agency.id, name: "Fictional contract browser project" } })
  const quote = await database.quote.create({ data: { companyId: company.id, clientId: client.id, projectId: project.id, number: "DEV-FICTIONAL-CONTRACT", object: "Fictional contract browser work", status: "ACCEPTED", currentVersion: 1, validUntil: new Date("2030-05-01T12:00:00Z"),
    versions: { create: { version: 1, totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000,
      sections: { create: { lines: { create: { label: "Fictional contract browser scope", quantity: 1, unitPriceCents: 10000, tvaRate: 20 } } } },
    } },
  } })
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(email)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  await page.goto(`/dashboard/devis/${quote.id}`)
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
  return { companyId: company.id, userId: user.id, membershipId: membership.id, quoteId: quote.id }
}

test("a contract refuses stale validity, resumes after reload and remains readable after a role change", async ({ page }, info) => {
  const fixture = await openFictionalQuote(page, info)
  await database.quote.update({ where: { id: fixture.quoteId }, data: { validUntil: new Date("2030-06-01T12:00:00Z") } })
  await page.getByRole("button", { name: "Plus d’actions", exact: true }).click()
  await page.getByRole("menuitem", { name: "Préparer le contrat", exact: true }).click()
  await expect(page.getByText("Le devis a changé. Rechargez la page avant de préparer le contrat ; votre saisie est conservée.", { exact: true })).toBeVisible()
  expect(await database.contract.count({ where: { companyId: fixture.companyId } })).toBe(0)
  await page.reload()
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
  await page.getByRole("button", { name: "Plus d’actions", exact: true }).click()
  await page.getByRole("menuitem", { name: "Préparer le contrat", exact: true }).click()
  await page.waitForURL(url => url.pathname.startsWith("/dashboard/contrats/"))
  const contract = await database.contract.findFirstOrThrow({ where: { sourceQuoteId: fixture.quoteId } })
  expect(contract.validUntil?.toISOString()).toBe("2030-06-01T12:00:00.000Z")
  expect(await database.auditLog.count({ where: { userId: fixture.userId, action: "CREATE_CONTRACT" } })).toBe(1)
  await database.membership.update({ where: { id: fixture.membershipId }, data: { role: "VIEWER" } })
  await page.goto(`/dashboard/devis/${fixture.quoteId}`)
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
  await page.getByRole("button", { name: "Plus d’actions", exact: true }).click()
  await page.getByRole("menuitem", { name: "Ouvrir le contrat", exact: true }).click()
  await page.waitForURL(url => url.pathname === `/dashboard/contrats/${contract.id}`)
  expect(await database.contract.count({ where: { companyId: fixture.companyId } })).toBe(1)
  expect(await database.auditLog.count({ where: { userId: fixture.userId, action: "CREATE_CONTRACT" } })).toBe(1)
})

test("a failed contract keeps the prepared order and form, then resumes without duplicate documents", async ({ page }, info) => {
  const fixture = await openFictionalQuote(page, info)
  const trigger = `fictional_browser_contract_audit_${info.project.name}`
  await database.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "AuditLog" WHEN NEW."userId" = '${fixture.userId}' AND NEW."action" = 'CREATE_CONTRACT' BEGIN SELECT RAISE(ABORT, 'Fictional browser contract audit failure'); END`)
  try {
    await page.getByRole("button", { name: "Lancer le dossier", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Lancer le dossier accepté", exact: true })
    await dialog.getByLabel("Acompte prévu", { exact: true }).fill("45")
    await dialog.getByLabel("Pose souhaitée", { exact: true }).fill("2030-02-20")
    await dialog.getByRole("button", { name: "Préparer le dossier", exact: true }).click()
    await expect(page.getByText(/Commande .* conservée\. Le contrat n’a pas pu être préparé/)).toBeVisible()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel("Acompte prévu", { exact: true })).toHaveValue("45")
    await expect(dialog.getByLabel("Pose souhaitée", { exact: true })).toHaveValue("2030-02-20")
    expect(await database.customerOrder.count({ where: { quoteId: fixture.quoteId } })).toBe(1)
    expect(await database.contract.count({ where: { companyId: fixture.companyId } })).toBe(0)
    expect(await database.auditLog.count({ where: { userId: fixture.userId } })).toBe(1)
    await database.$executeRawUnsafe(`DROP TRIGGER "${trigger}"`)
    await dialog.getByRole("button", { name: "Préparer le dossier", exact: true }).click()
    await expect(dialog).toBeHidden()
    expect(await database.customerOrder.count({ where: { quoteId: fixture.quoteId } })).toBe(1)
    expect(await database.contract.count({ where: { companyId: fixture.companyId } })).toBe(1)
    expect(await database.auditLog.count({ where: { userId: fixture.userId } })).toBe(2)
    expect(await database.invoice.count({ where: { companyId: fixture.companyId } })).toBe(0)
  } finally {
    await database.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}"`)
  }
})
