import { expect, test } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { captureScrollablePage } from "./helpers/visual-evidence"

for (const role of ["owner", "admin", "technician", "service", "sales", "accounting", "viewer", "operations"]) {
  test(`contact histories and engagement respect permissions for ${role}`, async ({ page }, info) => {
    const surface = info.project.name
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(`contact-readers-${role}-${surface}@example.test`)
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    await page.goto(`/dashboard/contacts/ccontactreaders${surface}local`)
    await expect(page.getByRole("heading", { name: "Fictional Local", exact: true })).toBeVisible()
    const automation = ["owner", "admin", "sales", "service", "operations"].includes(role)
    const metrics = page.locator(".record-metrics > div")
    const metric = (label: string) => metrics.filter({ has: page.getByText(label, { exact: true }) })
    if (automation) {
      await expect(page.getByText("Accès Automatisations requis", { exact: true })).toHaveCount(0)
      await expect(page.getByText("Fictional shared contact thread", { exact: true })).toBeVisible()
      await expect(page.getByText("Fictional local contact sequence", { exact: true })).toBeVisible()
      await expect(page.getByText("Fictional local contact delivery · SENT", { exact: true })).toBeVisible()
      const allMailboxes = role === "owner" || role === "admin"
      const personal = allMailboxes || role === "sales"
      await expect(page.getByText("Fictional personal contact thread", { exact: true })).toHaveCount(personal ? 1 : 0)
      await expect(page.getByText("Fictional colleague contact thread", { exact: true })).toHaveCount(allMailboxes ? 1 : 0)
      await expect(metric("Conversations").locator("p").nth(1)).toHaveText(allMailboxes ? "3" : personal ? "2" : "1")
      await expect(metric("E-mails envoyés").locator("p").nth(1)).toHaveText("1")
      await expect(metric("Séquences actives").locator("p").nth(1)).toHaveText("1")
    } else {
      await expect(page.getByText("Accès Automatisations requis", { exact: true })).toHaveCount(5)
      await expect(page.getByText("Fictional shared contact thread", { exact: true })).toHaveCount(0)
      await expect(page.getByText("Fictional local contact sequence", { exact: true })).toHaveCount(0)
    }
    await expect(metric("Accès portail").locator("p").nth(1)).toHaveText("1")
    await expect(page.getByText("GRANTED", { exact: true })).toBeVisible()
    await expect(page.getByText(/FICTIONAL-FOREIGN|Fictional foreign contact/)).toHaveCount(0)
    const directory = path.join(process.cwd(), "test-results", "contact-history-permissions", surface, role)
    await mkdir(directory, { recursive: true })
    expect((await captureScrollablePage(page, directory, "detail")).complete).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1)
    await page.goto("/dashboard/contacts")
    const contact = page.locator("article").filter({ has: page.getByRole("link", { name: "Fictional Local", exact: true }) })
    await expect(contact).toBeVisible()
    await expect(contact).toContainText("Accepté")
    if (automation) await expect(contact).toContainText("1 e-mail(s) · 1 séquence(s)")
    else await expect(contact).toContainText("Accès Automatisations requis")
    expect((await captureScrollablePage(page, directory, "directory")).complete).toBe(true)
  })
}
