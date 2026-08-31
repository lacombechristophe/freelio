import { expect, test } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const evidenceDir = path.join(os.tmpdir(), "crm-e2e-evidence")

test("executive reporting stays readable, filterable and exportable", async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })

  await page.goto("/dashboard/reports")
  await expect(page.getByRole("heading", { name: "Rapports de direction" })).toBeVisible()
  await expect(page.getByText("Décisions à prendre")).toBeVisible()
  await expect(page.getByText("Flux de la période")).toBeVisible()
  await expect(page.locator("html[data-app-hydrated='true']")).toHaveCount(1)

  await page.getByRole("link", { name: "30 j" }).click()
  await page.waitForURL(/\/dashboard\/reports\?period=30/)
  await expect(page.getByRole("link", { name: "30 j" })).toHaveAttribute("aria-current", "page")
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  if (testInfo.project.name === "desktop") {
    const response = await page.request.get("/api/reports/export?period=30")
    expect(response.ok()).toBeTruthy()
    expect(response.headers()["content-type"]).toContain("text/csv")
    expect(await response.text()).toContain("Domaine")
  }

  await page.getByRole("link", { name: "30 j" }).evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished))
  })
  await mkdir(evidenceDir, { recursive: true })
  await page.screenshot({ path: path.join(evidenceDir, `${testInfo.project.name}-reports.png`), fullPage: true })
  expect(consoleErrors).toEqual([])
})
