import { defineConfig, devices } from "@playwright/test"

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL
const baseURL = externalBaseUrl ?? "http://127.0.0.1:3000"
const productionServer = process.env.E2E_USE_PRODUCTION_SERVER === "true"

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 150_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
      command: productionServer
        ? "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000"
        : "npm run dev -- --hostname 127.0.0.1 --port 3000",
      url: "http://127.0.0.1:3000/auth/login",
      env: {
        ...process.env,
        PUBLIC_LEAD_COMPANY_ID: process.env.PUBLIC_LEAD_COMPANY_ID ?? "e2e-company",
        LEAD_ALLOWED_ORIGINS: process.env.LEAD_ALLOWED_ORIGINS ?? "https://example.test",
      },
      reuseExistingServer: true,
      timeout: 180_000,
    },
})
