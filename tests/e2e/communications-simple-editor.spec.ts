import { expect, test } from "@playwright/test"
import { emailHtmlField } from "./helpers/email-composer"

test("opening and switching authoring modes does not change or save the initial content", async ({ page }) => {
  const writes: string[] = []
  page.on("request", request => {
    if (request.method() === "POST" && request.headers()["next-action"] && request.postData()?.includes('"createKey"')) writes.push(request.postData()!)
  })
  await page.goto("/dashboard/communications?tab=compose")
  await expect(page.getByRole("textbox", { name: "Contenu du message", exact: true })).toBeEditable()
  const html = await emailHtmlField(page)
  const initial = await html.inputValue()
  await page.getByRole("button", { name: "Rédaction simple", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "Contenu du message", exact: true })).toContainText("Bonjour,")
  expect(await (await emailHtmlField(page)).inputValue()).toBe(initial)
  // Exercise the real autosave debounce, rather than stopping before it can run.
  await page.waitForTimeout(1200)
  expect(writes).toEqual([])
})

test("simple authoring supports emphasis, lists and safe links, preserving the HTML round trip", async ({ page }) => {
  await page.goto("/dashboard/communications?tab=compose")
  const editor = page.getByRole("textbox", { name: "Contenu du message", exact: true })
  await editor.fill("Dossier fictif à relire")
  await editor.press("ControlOrMeta+a")
  await page.getByRole("button", { name: "Gras", exact: true }).click()
  await expect(editor.locator("strong")).toHaveText("Dossier fictif à relire")
  await page.getByRole("button", { name: "Liste à puces", exact: true }).click()
  await expect(editor.locator("ul li")).toHaveCount(1)
  await editor.press("ControlOrMeta+a")
  await page.getByRole("button", { name: "Insérer ou modifier un lien", exact: true }).click()
  await page.getByLabel("Adresse du lien", { exact: true }).fill("javascript:alert(1)")
  await page.getByRole("button", { name: "Appliquer le lien", exact: true }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Utilisez une adresse" })).toBeVisible()
  await page.getByLabel("Adresse du lien", { exact: true }).fill("https://example.test/dossier")
  await page.getByRole("button", { name: "Appliquer le lien", exact: true }).click()
  await expect(editor.locator("a")).toHaveAttribute("href", "https://example.test/dossier")
  const html = await emailHtmlField(page)
  const content = await html.inputValue()
  await page.getByRole("button", { name: "Rédaction simple", exact: true }).click()
  await expect(editor.locator("a strong")).toHaveText("Dossier fictif à relire")
  expect(await (await emailHtmlField(page)).inputValue()).toBe(content)
})

test("advanced HTML remains editable without silently losing unsupported formatting", async ({ page }) => {
  await page.goto("/dashboard/communications?tab=compose")
  const html = await emailHtmlField(page)
  const content = '<p style="color:navy" data-history="original">Ancien contenu fictif</p>'
  await html.fill(content)
  await expect(page.getByText("Ce contenu utilise une mise en forme avancée.", { exact: false })).toBeVisible()
  await expect(page.getByRole("button", { name: "Rédaction simple", exact: true })).toBeDisabled()
  await expect(html).toHaveValue(content)
  await html.fill("<p>Contenu désormais compatible</p>")
  await expect(html).toBeVisible()
  await expect(page.getByRole("button", { name: "Rédaction simple", exact: true })).toBeEnabled()
  await page.getByRole("button", { name: "Rédaction simple", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "Contenu du message", exact: true })).toHaveText("Contenu désormais compatible")
})
