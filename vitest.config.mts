import { fileURLToPath } from "node:url"
import path from "node:path"

import { defineConfig } from "vitest/config"

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    alias: {
      "@": path.resolve(projectRoot, "./src"),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      // Keep the gate focused on the highest-risk, deterministic business code.
      // UI and provider SDKs are covered by integration/E2E checks instead.
      include: [
        "src/lib/finance/commercial-calculation.ts",
        "src/lib/migrations/ingest.ts",
        "src/lib/migrations/normalize.ts",
        "src/lib/pdf/facturx.ts",
      ],
      thresholds: {
        statements: 75,
        branches: 50,
        functions: 70,
        lines: 75,
      },
    },
  },
})
