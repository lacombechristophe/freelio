import { defineConfig, devices } from "@playwright/test"

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL
const baseURL = externalBaseUrl ?? "http://localhost:3000"

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
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
      command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
      url: "http://localhost:3000/auth/login",
      env: {
        ...process.env,
        DISKOOV_COMPANY_ID: process.env.DISKOOV_COMPANY_ID ?? "diskoov-e2e-company",
      },
      reuseExistingServer: true,
        timeout: 120_000,
      },
})
