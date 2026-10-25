import { defineConfig } from "@playwright/test"

const baseURL = process.env.PLAYWRIGHT_BASE_URL
if (!baseURL || new URL(baseURL).protocol !== "https:") throw new Error("An explicit HTTPS demonstration URL is required")
if (!process.env.HOSTED_DEMO_EMAIL || !process.env.HOSTED_DEMO_PASSWORD) throw new Error("Fictitious demonstration credentials are required")

export default defineConfig({
  testDir: "./tests/hosted",
  outputDir: "test-results/hosted",
  timeout: 600_000,
  expect: { timeout: 45_000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: new URL(baseURL).origin,
    trace: "off",
    screenshot: "off",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
    extraHTTPHeaders: {
      "x-vercel-skip-toolbar": "1",
      ...(process.env.VERCEL_AUTOMATION_BYPASS ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS } : {}),
    },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 }, timezoneId: "Pacific/Kiritimati" } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles" } },
  ],
})
