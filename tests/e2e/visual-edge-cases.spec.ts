import { execFileSync } from "node:child_process"
import { contrast } from "./helpers/contrast"
import { expect, test, type Page } from "@playwright/test"

async function login(page: Page) {
  await page.context().clearCookies()
  await page.goto("/auth/login")
  await page.getByLabel("Adresse e-mail professionnelle").fill("visual-quality@example.test")
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await page.waitForURL(url => url.pathname === "/dashboard")
}


test("a failed company logo keeps the brand and composed avatar glyphs readable on a narrow header", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await login(page)
  const brand = page.locator("header").getByRole("link", { name: "👩🏽‍💻 Atelier — démonstration visuelle", exact: true })
  await expect(brand.locator("img")).toHaveCount(0)
  await expect(brand).toContainText("👩🏽‍💻")
  await expect(page.getByRole("button", { name: "Ouvrir le menu du compte", exact: true })).toContainText("👩🏽‍💻É")
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test("conversation text and fictional recovery codes retain text contrast in both themes", async ({ page }, info) => {
  await login(page)
  await page.goto("/dashboard/communications")
  await page.locator("button[data-selected]").filter({ hasText: "UIQA Contraste de conversation" }).click()
  const message = page.getByRole("article").getByText("Message fictif lisible dans les deux thèmes.", { exact: true })
  for (const theme of ["light", "dark"]) {
    await page.getByRole("button", { name: "Ouvrir le menu du compte", exact: true }).click()
    await page.getByRole("menuitemradio", { name: theme === "dark" ? "Sombre" : "Clair", exact: true }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toBeHidden()
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`))
    await expect(message).toBeVisible()
    expect(await contrast(message)).toBeGreaterThanOrEqual(4.5)
    await info.attach(`conversation-${theme}`, { body: await page.screenshot(), contentType: "image/png" })
  }
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.outerHTML).join(""))
  // Render the real stateless component outside Playwright's JSX transform.
  const codes = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", 'import React from "react"; import {renderToStaticMarkup} from "react-dom/server"; import {RecoveryCodes} from "./src/components/auth/recovery-codes.tsx"; process.stdout.write(renderToStaticMarkup(React.createElement(RecoveryCodes,{codes:["FAKE-0000","FAKE-1111"]})))'], { encoding: "utf8", env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, NODE_ENV: "test" }, timeout: 15000 })
  for (const theme of ["light", "dark"]) {
    await page.setContent(`<html class="${theme === "dark" ? "dark" : ""}"><head>${styles}</head><body class="bg-background text-foreground p-8"><section class="bg-card p-8">${codes}</section></body></html>`)
    const code = page.getByText("FAKE-0000", { exact: true })
    await expect(code).toBeVisible()
    expect(await contrast(code)).toBeGreaterThanOrEqual(4.5)
    expect(await contrast(page.getByText("Copiez ces codes maintenant : ils ne seront plus affichés.", { exact: true }))).toBeGreaterThanOrEqual(4.5)
    await info.attach(`recovery-codes-${theme}`, { body: await page.screenshot(), contentType: "image/png" })
  }
})

test("search remains usable in a short landscape viewport with readable mobile fields", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 280 })
  await page.goto("/dashboard")
  await page.getByRole("button", { name: "Ouvrir la recherche globale", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Recherche globale", exact: true })
  const search = dialog.getByRole("textbox")
  await expect(search).toBeFocused()
  const box = await dialog.boundingBox()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(280)
  expect(await search.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16)
  await search.fill("Client QA")
  await expect(dialog.getByRole("button").filter({ hasText: "Client QA" }).first()).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: "Ouvrir la recherche globale", exact: true })).toBeFocused()
})
