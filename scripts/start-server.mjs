import nextEnv from "@next/env"
import { spawn } from "node:child_process"
import { productionConfigurationIssues } from "../src/lib/readiness.ts"

process.env.NODE_ENV = "production"
nextEnv.loadEnvConfig(process.cwd(), false)
const issues = productionConfigurationIssues()
if (issues.length) {
  // Variable names only: never reflect configured secrets or URLs.
  console.error(`Configuration de production incomplète : ${[...new Set(issues)].join(", ")}`)
  process.exit(1)
}
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", ...process.argv.slice(2)], { env: process.env, stdio: "inherit", windowsHide: true })
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.kill(signal))
server.on("error", () => { console.error("Le serveur n’a pas pu démarrer"); process.exitCode = 1 })
server.on("exit", code => { process.exitCode = code ?? 1 })
