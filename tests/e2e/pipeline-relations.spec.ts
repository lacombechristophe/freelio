import { PrismaClient } from "@prisma/client"
import { expect, test } from "@playwright/test"

const database = new PrismaClient()
test.afterAll(async () => { await database.$disconnect() })
test("Compiled pipeline hides foreign references and refuses an edit after its owner changes", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette Affaires exige une SQLite fictive isolée")
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  const ownId = `cpipelinerelationown${info.project.name}`
  const own = await database.opportunity.findUniqueOrThrow({ where: { id: ownId } })
  const foreignOwner = await database.opportunity.findUniqueOrThrow({ where: { id: `cpipelinerelationowner${info.project.name}` } })
  await page.context().clearCookies(); await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill(`pipeline-relations-${info.project.name}@example.test`)
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
  await page.goto("/dashboard/pipeline")
  await expect(page.getByRole("link", { name: "PIPELINE-COHERENT-DEAL", exact: true })).toBeVisible()
  expect(await page.locator("body").innerText()).not.toContain("PIPELINE-FOREIGN")
  await page.getByRole("combobox", { name: "Cycle de vente", exact: true }).click()
  await expect(page.getByRole("option", { name: /SCOPED-PIPELINE\s*1$/ })).toBeVisible()
  await page.keyboard.press("Escape")
  for (const kind of ["client", "owner"]) {
    await page.goto(`/dashboard/pipeline/cpipelinerelation${kind}${info.project.name}`)
    await expect(page.getByRole("heading", { name: "Cette page n’existe pas.", exact: true })).toBeVisible()
    expect(await page.locator("body").innerText()).not.toContain("PIPELINE-FOREIGN")
  }
  await page.goto(`/dashboard/pipeline/${ownId}`)
  await expect(page.getByRole("heading", { name: "PIPELINE-COHERENT-DEAL", exact: true })).toBeVisible()
  await page.goto("/dashboard/pipeline")
  await page.getByRole("button", { name: "Ouvrir les actions de l’opportunité", exact: true }).click()
  await page.getByRole("menuitem", { name: "Éditer", exact: true }).click()
  const dialog = page.getByRole("dialog")
  const save = dialog.getByRole("button", { name: "Enregistrer", exact: true })
  await expect(save).toBeEnabled()
  await dialog.locator("#title").fill("Fictional coherent accepted edit")
  await save.click()
  await expect(dialog).toBeHidden()
  expect((await database.opportunity.findUniqueOrThrow({ where: { id: ownId } })).title).toBe("Fictional coherent accepted edit")
  await page.getByRole("button", { name: "Ouvrir les actions de l’opportunité", exact: true }).click()
  await page.getByRole("menuitem", { name: "Éditer", exact: true }).click()
  await expect(save).toBeEnabled()
  await dialog.locator("#title").fill("Fictional refused race edit")
  const audits = await database.auditLog.count({ where: { resourceId: ownId } })
  try {
    await database.opportunity.update({ where: { id: ownId }, data: { ownerMembershipId: foreignOwner.ownerMembershipId } })
    const response = page.waitForResponse(response => response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]))
    await save.click(); await response
    await expect(page.getByText("Opportunité introuvable", { exact: true })).toBeVisible()
    await expect(save).toBeEnabled()
    await expect(dialog.locator("#title")).toHaveValue("Fictional refused race edit")
    expect(await database.opportunity.findUniqueOrThrow({ where: { id: ownId } })).toMatchObject({ title: "Fictional coherent accepted edit", ownerMembershipId: foreignOwner.ownerMembershipId })
    expect(await database.auditLog.count({ where: { resourceId: ownId } })).toBe(audits)
  } finally {
    await database.opportunity.update({ where: { id: ownId }, data: { ownerMembershipId: own.ownerMembershipId } })
  }
  expect(await database.opportunity.count({ where: { pipelineId: own.pipelineId } })).toBe(3)
  expect(errors).toEqual([])
})
