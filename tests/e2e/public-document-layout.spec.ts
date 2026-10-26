import { createHash, randomBytes } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { expect, test, type Locator } from "@playwright/test"
import { createDatabaseClient } from "@/lib/database-client"
import { contrast } from "./helpers/contrast"

const database = createDatabaseClient()
test.afterAll(async () => { await database.$disconnect() })

test("valid public documents retain contrast and readable long text in both themes", async ({ page, browser, baseURL }, info) => {
  if (process.env.RECIPE_ISOLATED !== "true" || !process.env.DATABASE_URL?.startsWith("file:") || process.env.PLAYWRIGHT_BASE_URL) throw new Error("La recette exige une SQLite fictive isolée")
  const company = await database.company.findUniqueOrThrow({ where: { id: "ce2ecompany000000000000001" }, select: { id: true, name: true, logo: true, serviceTimezone: true } })
  const tag = `public-layout-${info.project.name}-${Date.now()}`
  const title = "Préparer le contrôle de filtration et de couverture pour une résidence accueillant plusieurs familles"
  const category = "Entretien préventif et contrôles saisonniers"
  const contractTitle = "Installation et maintenance de la couverture de sécurité pour une résidence accueillant plusieurs familles"
  const reference = "https://documentation.example.test/equipements/filtration/controle-saisonnier-et-parametres-de-fonctionnement-du-bassin"
  const bodyHtml = `<p>Référence fictive : ${reference}</p>`
  const token = randomBytes(32).toString("base64url")
  const feedbackToken = randomBytes(32).toString("base64url")
  const feedbackQuestion = "Comment évaluez-vous la préparation et le suivi de votre intervention de démonstration ?"
  const followUpQuestion = "Quels points faudrait-il améliorer avant la prochaine intervention de démonstration ?"
  const output = path.resolve("test-results", "public-document-layout", info.project.name)
  const checks: Array<{ surface: string; theme: string; width: number; textSize: number; headingContrast: number; bodyContrast: number }> = []
  let clientId: string | undefined
  let articleId: string | undefined
  let contractId: string | undefined
  let surveyId: string | undefined
  const context = await browser.newContext({
    baseURL, storageState: { cookies: [], origins: [] },
    isMobile: info.project.use.isMobile, hasTouch: info.project.use.hasTouch,
    userAgent: info.project.use.userAgent, timezoneId: "Pacific/Kiritimati",
  })
  try {
    await mkdir(output, { recursive: true })
    await database.company.update({ where: { id: company.id }, data: { name: "👩🏽‍💻 Atelier des Bassins — Installation et maintenance des piscines et équipements extérieurs", logo: "/missing-public-layout-logo.png", serviceTimezone: "America/New_York" } })
    clientId = (await database.client.create({ data: { companyId: company.id, name: "Résidence Les Amandiers — exemple fictif", address: "7 rue des Essais, 44000 Nantes" } })).id
    await database.contact.create({ data: { clientId, firstName: "Camille", lastName: "Démonstration", email: "public-layout@example.test", isPrimary: true } })
    articleId = (await database.knowledgeArticle.create({ data: { companyId: company.id, title, slug: tag, summary: "Une fiche fictive de préparation, sans intervention réelle.", category, bodyHtml, status: "PUBLISHED", visibility: "PORTAL", updatedAt: new Date("2026-10-26T01:30:00Z") } })).id
    contractId = (await database.contract.create({ data: { companyId: company.id, clientId, number: `PUBLIC-${info.project.name}`, title: contractTitle, content: bodyHtml, status: "DRAFT" } })).id
    await database.clientPortalAccess.create({ data: { companyId: company.id, clientId, label: tag, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } })
    surveyId = (await database.satisfactionSurvey.create({ data: { companyId: company.id, name: tag, type: "NPS", question: feedbackQuestion, followUpQuestion, scaleMin: 0, scaleMax: 10 } })).id
    const feedback = await database.satisfactionRequest.create({ data: { companyId: company.id, clientId, surveyId, tokenHash: createHash("sha256").update(feedbackToken).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } })

    await page.goto(`/dashboard/contrats/${contractId}`)
    await page.getByRole("button", { name: "Actions", exact: true }).click()
    await page.getByRole("menuitem", { name: "Envoyer pour signature", exact: true }).click()
    const signingUrl = await page.getByRole("dialog", { name: "Invitation de signature prête" }).getByLabel("Lien de signature à partager").inputValue()
    expect(new URL(signingUrl).origin).toBe(baseURL)

    await context.route("**/*", route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort())
    const publicPage = await context.newPage()
    const errors: string[] = []
    publicPage.on("pageerror", error => errors.push(error.message))
    await publicPage.goto(`/portal/access/${token}`)
    const assertWidth = async () => expect(await publicPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(publicPage.viewportSize()!.width + 1)
    const capture = async (name: string) => publicPage.screenshot({ path: path.join(output, `${name}.jpg`), fullPage: true, type: "jpeg", quality: 65, scale: "css" })
    const readable = async (locator: Locator) => {
      await expect(locator).toBeVisible()
      const overflow = await locator.evaluate(element => {
        const style = getComputedStyle(element)
        return {
          horizontal: element.scrollWidth > element.clientWidth + 1,
          // Font ink may extend beyond its line box without being clipped.
          clippedVertically: ["hidden", "clip"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1,
        }
      })
      expect(overflow).toEqual({ horizontal: false, clippedVertically: false })
      const ratio = await contrast(locator)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
      return ratio
    }
    for (const theme of ["light", "dark"] as const) {
      await publicPage.evaluate(value => localStorage.setItem("theme", value), theme)
      await publicPage.setViewportSize({ width: 320, height: 900 })
      await publicPage.goto("/portal")
      await expect(publicPage.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`))
      await expect(publicPage.getByRole("heading", { name: "Votre dossier en un coup d’œil", exact: true })).toBeVisible()
      await expect(publicPage.locator("header img")).toHaveCount(0)
      await expect(publicPage.locator("header").getByText("👩🏽‍💻", { exact: true })).toBeVisible()
      await expect(publicPage.locator("a button")).toHaveCount(0)
      await readable(publicPage.getByText("Bonjour Résidence Les Amandiers — exemple fictif", { exact: true }))
      await assertWidth()
      await capture(`portal-${theme}-320`)
      for (const [surface, route, headingText, bodyText] of [["article", `/portal/aide/${articleId}`, title, `Référence fictive : ${reference}`], ["signature", signingUrl, contractTitle, `Référence fictive : ${reference}`], ["feedback", `/feedback/${feedbackToken}`, feedbackQuestion, followUpQuestion]]) {
        for (const [width, textSize] of [[320, 16], [1440, 16], [1440, 32], [1440, 64]]) {
          await publicPage.setViewportSize({ width, height: 900 })
          await publicPage.goto(route)
          await publicPage.waitForFunction(() => document.documentElement.dataset.appHydrated === "true")
          await publicPage.evaluate(size => { document.documentElement.style.fontSize = `${size}px` }, textSize)
          await assertWidth()
          const headingContrast = await readable(publicPage.getByText(headingText, { exact: true }))
          const bodyContrast = await readable(publicPage.getByText(bodyText, { exact: true }))
          if (surface === "article") {
            await readable(publicPage.getByText(category, { exact: true }))
            await expect(publicPage.getByText(/mis à jour le 25 octobre 2026/)).toBeVisible()
            await expect(publicPage.locator("header img")).toHaveCount(0)
          } else if (surface === "signature") {
            await expect(publicPage.locator("canvas")).toBeVisible()
            await expect(publicPage.getByLabel("Nom complet du signataire")).toBeEditable()
            await expect(publicPage.getByRole("button", { name: "Signer électroniquement", exact: true })).toBeEnabled()
          } else {
            const score = publicPage.getByRole("button", { name: "10", exact: true })
            const target = await score.boundingBox()
            expect(target?.width).toBeGreaterThanOrEqual(44)
            expect(target?.height).toBeGreaterThanOrEqual(44)
            await expect(publicPage.getByRole("button", { name: "Envoyer ma réponse", exact: true })).toBeDisabled()
            await score.click()
            await expect(score).toHaveAttribute("aria-pressed", "true")
            await expect.poll(() => contrast(score)).toBeGreaterThanOrEqual(4.5)
            await expect(publicPage.getByRole("button", { name: "Envoyer ma réponse", exact: true })).toBeEnabled()
          }
          checks.push({ surface, theme, width, textSize, headingContrast, bodyContrast })
          if (textSize !== 32) await capture(`${surface}-${theme}-${width}-text${textSize}`)
        }
      }
    }
    expect(errors).toEqual([])
    expect(await database.contractSignature.count({ where: { contractId } })).toBe(0)
    expect((await database.contract.findUniqueOrThrow({ where: { id: contractId } })).status).toBe("SENT")
    expect(await database.satisfactionRequest.findUniqueOrThrow({ where: { id: feedback.id }, select: { status: true, score: true } })).toEqual({ status: "PENDING", score: null })
  } finally {
    await writeFile(path.join(output, "report.json"), JSON.stringify({ project: info.project.name, checks, scope: "Fictitious valid routes; text enlargement is not browser zoom", signatureSubmitted: false, feedbackSubmitted: false, providerCalled: false }, null, 2))
    await context.close()
    await database.company.update({ where: { id: company.id }, data: { name: company.name, logo: company.logo, serviceTimezone: company.serviceTimezone } })
    if (contractId) {
      await database.contractSigningToken.deleteMany({ where: { contractId } })
      await database.contract.delete({ where: { id: contractId } })
    }
    if (articleId) await database.knowledgeArticle.delete({ where: { id: articleId } })
    if (surveyId) await database.satisfactionSurvey.delete({ where: { id: surveyId } })
    if (clientId) {
      await database.clientPortalAccess.deleteMany({ where: { clientId } })
      await database.contact.deleteMany({ where: { clientId } })
      await database.client.delete({ where: { id: clientId } })
    }
  }
})
