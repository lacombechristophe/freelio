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
  },
})
