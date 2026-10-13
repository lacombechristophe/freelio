import { createHash } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { expect, test } from "@playwright/test"

const database = new PrismaClient()
test.afterAll(async () => { await database.$disconnect() })

test("Compiled portal rejects incoherent links and rechecks an existing session", async ({ page }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL || !["desktop", "mobile"].includes(info.project.name)) throw new Error("La recette Portail exige une SQLite fictive isolée")
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  await page.context().clearCookies()
  const token = (kind: string) => createHash("sha256").update(`fictional-portal-relations-${info.project.name}-${kind}`).digest("base64url")
  for (const kind of ["foreignclient", "foreigncontact"]) {
    await page.goto(`/portal/access/${token(kind)}`)
    await expect(page.getByText("Ce lien a expiré, a été révoqué ou n’est plus valide.", { exact: true })).toBeVisible()
    expect(await page.context().cookies()).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "crm_portal_session" })]))
    const body = await page.locator("body").innerText()
    expect(body).not.toContain("FICTIONAL-PORTAL-FOREIGN-PARTY")
    expect(body).not.toContain("FICTIONAL-FOREIGN")
    expect((await database.clientPortalAccess.findUniqueOrThrow({ where: { id: `cportalrelation${kind}${info.project.name}` } })).lastUsedAt).toBeNull()
  }
  await page.goto(`/portal/access/${token("own")}`)
  await expect(page.getByRole("heading", { name: "Votre dossier en un coup d’œil" })).toBeVisible()
  const ownLink = await database.clientPortalAccess.findUniqueOrThrow({ where: { id: `cportalrelationown${info.project.name}` } })
  expect(ownLink.lastUsedAt).not.toBeNull()
  const invalidLink = await database.clientPortalAccess.findUniqueOrThrow({ where: { id: `cportalrelationforeignclient${info.project.name}` } })
  try {
    await database.clientPortalAccess.update({ where: { id: ownLink.id }, data: { clientId: invalidLink.clientId } })
    const response = await page.request.post("/api/portal/messages", { data: { body: "Fictional blocked session message" }, headers: { origin: new URL(page.url()).origin } })
    expect(response.status()).toBe(401)
    expect(await database.clientPortalMessage.count({ where: { companyId: ownLink.companyId } })).toBe(0)
    await page.goto(`/portal/access/${token("own")}`)
    await expect(page.getByText("Ce lien a expiré, a été révoqué ou n’est plus valide.", { exact: true })).toBeVisible()
  } finally {
    await database.clientPortalAccess.update({ where: { id: ownLink.id }, data: { clientId: ownLink.clientId } })
  }
  expect(errors).toEqual([])
})
