import { expect, test, type Page } from "@playwright/test"

function savedStatus(page: Page) { return page.getByRole("status").filter({ hasText: "Brouillon enregistré" }) }
function draftRow(page: Page, subject: string) { return page.locator("div.border-b").filter({ has: page.getByText(subject, { exact: true }) }) }
async function deleteDraft(page: Page, subject: string) {
  await page.getByRole("tab", { name: "Brouillons", exact: true }).click()
  await draftRow(page, subject).getByRole("button", { name: "Supprimer", exact: true }).click()
  await page.getByRole("dialog", { name: "Supprimer ce brouillon ?" }).getByRole("button", { name: "Supprimer", exact: true }).click()
  await expect(page.getByText(subject, { exact: true })).toHaveCount(0)
}

test("autosaves after a pause without creating an untouched draft or overwriting newer typing during a slow response", async ({ page }, testInfo) => {
  const subject = `UIQA Autosave ${testInfo.project.name} ${Date.now()}`
  let saves = 0
  let release!: () => void, persisted!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const firstPersisted = new Promise<void>(resolve => { persisted = resolve })
  await page.route("**/dashboard/communications**", async route => {
    if (route.request().method() !== "POST" || !route.request().headers()["next-action"]) return route.continue()
    if (!route.request().postData()?.includes(subject)) return route.continue()
    saves++
    if (saves !== 1) return route.continue()
    const response = await route.fetch()
    persisted()
    await gate
    await route.fulfill({ response })
  })
  await page.goto("/dashboard/communications?tab=compose")
  const requests: string[] = []
  page.on("request", request => { if (request.method() === "POST" && request.headers()["next-action"] && request.postData()?.includes('"createKey"')) requests.push(request.postData() || "") })
  // A real debounce interval must pass to detect unwanted default-form writes.
  await page.waitForTimeout(1200)
  expect(requests).toHaveLength(0)
  await page.getByLabel("Objet", { exact: true }).fill(subject)
  await page.getByLabel("Contenu HTML", { exact: true }).fill("<p>First version</p>")
  await firstPersisted
  await expect(page.getByLabel("Contenu HTML", { exact: true })).toBeEnabled()
  await page.getByLabel("Contenu HTML", { exact: true }).fill("  <p>Newer typing stays here</p>  ")
  await page.getByLabel("CC", { exact: true }).fill("copy@example.test ")
  await page.getByLabel("CCI", { exact: true }).fill("hidden@example.test")
  await page.getByLabel("Expéditeur", { exact: true }).selectOption("cuiqareplysecondmailbox00")
  await page.getByLabel("Destinataire", { exact: true }).selectOption({ index: 1 })
  const recipient = await page.getByLabel("Destinataire", { exact: true }).inputValue()
  await page.getByLabel("CCI", { exact: true }).focus()
  release()
  await expect(savedStatus(page)).toContainText("version 2")
  await expect(page.getByLabel("CCI", { exact: true })).toBeFocused()
  await expect(page.getByLabel("Contenu HTML", { exact: true })).toHaveValue("  <p>Newer typing stays here</p>  ")
  await expect(page.getByLabel("CC", { exact: true })).toHaveValue("copy@example.test ")
  await page.waitForTimeout(1200)
  expect(saves).toBe(2)
  await page.reload()
  await page.getByRole("tab", { name: "Brouillons", exact: true }).click()
  await draftRow(page, subject).getByRole("button", { name: "Rouvrir", exact: true }).click()
  await expect(page.getByLabel("Contenu HTML", { exact: true })).toHaveValue("<p>Newer typing stays here</p>")
  await expect(page.getByLabel("CC", { exact: true })).toHaveValue("copy@example.test")
  await expect(page.getByLabel("CCI", { exact: true })).toHaveValue("hidden@example.test")
  await expect(page.getByLabel("Expéditeur", { exact: true })).toHaveValue("cuiqareplysecondmailbox00")
  await expect(page.getByLabel("Destinataire", { exact: true })).toHaveValue(recipient)
  await deleteDraft(page, subject)
  await page.getByRole("tab", { name: "Nouvel e-mail", exact: true }).click()
  await expect(page.getByLabel("Contenu HTML", { exact: true })).toHaveValue("<p>Newer typing stays here</p>")
  await page.waitForTimeout(1200)
  expect(saves).toBe(2)
  await page.getByLabel("Contenu HTML", { exact: true }).fill("<p>Explicit new edit after deletion</p>")
  await expect(savedStatus(page)).toContainText("version 1")
  expect(saves).toBe(3)
  await deleteDraft(page, subject)
})

test("manual save waits for the automatic revision and attachment changes use its latest version", async ({ page }, testInfo) => {
  const subject = `UIQA Autosave manual ${testInfo.project.name} ${Date.now()}`
  let held = false
  let release!: () => void, persisted!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const firstPersisted = new Promise<void>(resolve => { persisted = resolve })
  await page.route("**/dashboard/communications**", async route => {
    if (held || route.request().method() !== "POST" || !route.request().headers()["next-action"] || !route.request().postData()?.includes(subject)) return route.continue()
    held = true
    const response = await route.fetch(); persisted(); await gate; await route.fulfill({ response })
  })
  await page.goto("/dashboard/communications?tab=compose")
  await page.getByLabel("Objet", { exact: true }).fill(subject)
  await firstPersisted
  await page.getByLabel("Contenu HTML", { exact: true }).fill("<p>Manual save must keep this edit</p>")
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click()
  await expect(page.getByLabel("Contenu HTML", { exact: true })).toBeDisabled()
  release()
  await expect(savedStatus(page)).toContainText("version 2")
  await expect(page.getByLabel("Contenu HTML", { exact: true })).toHaveValue("<p>Manual save must keep this edit</p>")
  await page.getByLabel("CCI", { exact: true }).fill("hidden@example.test")
  await expect(savedStatus(page)).toContainText("version 3")
  const chooser = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: "Joindre un fichier", exact: true }).click()
  await (await chooser).setFiles({ name: "autosave.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-fictional autosave fixture") })
  await expect(savedStatus(page)).toContainText("version 4")
  await page.getByRole("button", { name: "Retirer autosave.pdf", exact: true }).click()
  await expect(savedStatus(page)).toContainText("version 5")
  await deleteDraft(page, subject)
})

test("stops autosaving after a cross-tab conflict and resumes only after reopening the saved revision", async ({ page, context }, testInfo) => {
  const subject = `UIQA Autosave conflict ${testInfo.project.name} ${Date.now()}`
  await page.goto("/dashboard/communications?tab=compose")
  await page.getByLabel("Objet", { exact: true }).fill(subject)
  await expect(savedStatus(page)).toContainText("version 1")
  const other = await context.newPage()
  await other.goto("/dashboard/communications?tab=drafts")
  await draftRow(other, subject).getByRole("button", { name: "Rouvrir", exact: true }).click()
  await other.getByLabel("Contenu HTML", { exact: true }).fill("<p>Saved by the other tab</p>")
  await expect(savedStatus(other)).toContainText("version 2")
  let attempts = 0
  page.on("request", request => { if (request.method() === "POST" && request.headers()["next-action"] && request.postData()?.includes(subject)) attempts++ })
  await page.getByLabel("Contenu HTML", { exact: true }).fill("<p>My conflicting text</p>")
  await expect(page.getByRole("status").filter({ hasText: "Conflit" })).toBeVisible()
  await page.getByLabel("Contenu HTML", { exact: true }).fill("<p>Keep typing after the conflict</p>")
  await page.waitForTimeout(1200)
  expect(attempts).toBe(1)
  await expect(page.getByLabel("Contenu HTML", { exact: true })).toHaveValue("<p>Keep typing after the conflict</p>")
  await page.getByRole("tab", { name: "Brouillons", exact: true }).click()
  await draftRow(page, subject).getByRole("button", { name: "Rouvrir", exact: true }).click()
  await page.getByRole("dialog", { name: "Remplacer les modifications non enregistrées ?" }).getByRole("button", { name: "Remplacer", exact: true }).click()
  await expect(page.getByLabel("Contenu HTML", { exact: true })).toHaveValue("<p>Saved by the other tab</p>")
  await page.getByLabel("Contenu HTML", { exact: true }).fill("<p>Autosave resumed explicitly</p>")
  await expect(savedStatus(page)).toContainText("version 3")
  await deleteDraft(page, subject)
  await other.close()
})
