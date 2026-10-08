import { expect, test } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { strFromU8, unzipSync } from "fflate"

for (const role of ["owner", "technician", "service", "viewer"]) {
  test(`restricts service analytics and its real ZIP for ${role}`, async ({ page }, info) => {
    await page.context().clearCookies()
    await page.goto("/auth/login")
    await page.getByLabel("Adresse e-mail professionnelle").fill(`analytics-${role}-${info.project.name}@example.test`)
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.E2E_USER_PASSWORD || "RecetteSolide2026")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 60_000 })
    await page.goto("/dashboard/service/analytics")
    const health = page.locator('[data-slot="card"]').filter({ has: page.getByText("Santé du portefeuille", { exact: true }) })
    const diagnostics = page.locator('[data-slot="card"]').filter({ has: page.getByText("Diagnostics utilisés", { exact: true }) })
    const satisfaction = page.locator(".record-metrics > div").filter({ hasText: "Satisfaction globale" })
    await expect(diagnostics).toContainText("Fictional local guide")
    if (role === "owner") {
      await expect(health).toContainText("À risque")
      await expect(health).not.toContainText("Historique global indisponible")
      await expect(diagnostics).toContainText("Fictional other guide")
      await expect(satisfaction).toContainText("50%")
    } else {
      await expect(health).toContainText("Historique global indisponible")
      await expect(health).not.toContainText("À risque")
      await expect(diagnostics).not.toContainText("Fictional other guide")
      await expect(satisfaction).toContainText("100%")
      await expect(page.getByText("Historique global indisponible", { exact: true })).toHaveCount(2)
    }
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("link", { name: "Exporter l’analyse", exact: true }).click()
    const download = await downloadPromise
    const archive = unzipSync(await readFile((await download.path())!))
    const summary = strFromU8(archive["resume.csv"])
    const cohorts = strFromU8(archive["sante-portefeuille.csv"])
    const exportedDiagnostics = strFromU8(archive["diagnostics.csv"])
    if (role === "owner") { expect(summary).not.toContain("Historique global indisponible"); expect(cohorts).toContain("RISK") }
    else {
      expect(summary).toContain("Historique global indisponible")
      expect(cohorts).toContain("Historique global indisponible")
      expect(cohorts).not.toMatch(/HEALTHY|WATCH|RISK/)
      expect(exportedDiagnostics).not.toContain("Fictional other guide")
    }
  })
}
