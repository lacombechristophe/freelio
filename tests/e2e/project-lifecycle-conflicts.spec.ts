import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { expect, test } from "@playwright/test"

const database = new PrismaClient()
test.afterAll(async () => { await database.$disconnect() })

test("project lifecycle refuses stale forms and preserves the user's input", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette Chantiers exige une SQLite fictive isolée")
  const source = await database.user.findUniqueOrThrow({ where: { email: `purchase-creation-${info.project.name}@example.test` }, select: { passwordHash: true } })
  const company = await database.company.create({ data: { name: "Fictitious project conflict company" } })
  await database.saasSubscription.create({ data: { companyId: company.id, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
  const email = `project-conflict-${info.project.name}-${randomUUID()}@example.test`
  const user = await database.user.create({ data: { companyId: company.id, email, emailVerified: new Date(), passwordHash: source.passwordHash } })
  await database.membership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } })
  const client = await database.client.create({ data: { companyId: company.id, name: "Fictitious conflict client" } })
  const project = await database.project.create({ data: { companyId: company.id, clientId: client.id, name: "Fictitious conflict project", budgetCents: 12000 } })
  const message = "Le chantier a changé. Rechargez la page puis réessayez ; votre saisie est conservée."
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(email)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  await page.goto("/dashboard/projets")
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
  await page.getByRole("button", { name: `Actions pour ${project.name}`, exact: true }).click()
  await page.getByRole("menuitem", { name: "Modifier", exact: true }).click()
  const editor = page.getByRole("dialog", { name: "Éditer le projet", exact: true })
  await editor.getByLabel("Nom *", { exact: true }).fill("Fictitious unsaved name")
  await editor.getByLabel("Description", { exact: true }).fill("Fictitious input to preserve")
  const concurrent = await database.project.update({ where: { id: project.id }, data: { name: "Fictitious concurrent name", updatedAt: new Date(project.updatedAt.getTime() + 1000) } })
  await expect(editor.getByRole("button", { name: "Enregistrer", exact: true })).toBeEnabled()
  await editor.getByRole("button", { name: "Enregistrer", exact: true }).click()
  await expect(page.getByText(message, { exact: true })).toBeVisible()
  await expect(editor).toBeVisible()
  await expect(editor.getByLabel("Nom *", { exact: true })).toHaveValue("Fictitious unsaved name")
  await expect(editor.getByLabel("Description", { exact: true })).toHaveValue("Fictitious input to preserve")
  expect(await database.project.findUniqueOrThrow({ where: { id: project.id } })).toEqual(concurrent)
  await editor.getByRole("button", { name: "Annuler", exact: true }).click()

  for (const operation of ["Archiver", "Supprimer"] as const) {
    await page.reload()
    await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
    const actions = page.getByRole("button", { name: `Actions pour ${concurrent.name}`, exact: true })
    await expect(actions).toBeVisible()
    const latest = await database.project.findUniqueOrThrow({ where: { id: project.id } })
    const changed = await database.project.update({ where: { id: project.id }, data: { description: `Fictitious concurrent ${operation}`, updatedAt: new Date(latest.updatedAt.getTime() + 1000) } })
    await actions.click()
    await page.getByRole("menuitem", { name: operation, exact: true }).click()
    if (operation === "Supprimer") await page.getByRole("dialog", { name: `Supprimer « ${concurrent.name} » ?`, exact: true }).getByRole("button", { name: "Supprimer", exact: true }).click()
    await expect(page.getByText(message, { exact: true })).toBeVisible()
    expect(await database.project.findUniqueOrThrow({ where: { id: project.id } })).toEqual(changed)
  }
  expect(await database.auditLog.count({ where: { resourceId: project.id } })).toBe(0)
  expect(errors).toEqual([])
})
