import { spawnSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import nextEnv from "@next/env"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, "..")
const sourcePath = path.join(projectRoot, "prisma", "schema.prisma")
const targetPath = path.join(projectRoot, "prisma", "postgresql", "schema.prisma")

const source = await readFile(sourcePath, "utf8")
const postgres = source
  .replace('provider = "sqlite"', 'provider = "postgresql"')

if (postgres === source) throw new Error("Impossible de produire le schéma Prisma PostgreSQL")
await mkdir(path.dirname(targetPath), { recursive: true })
await writeFile(targetPath, postgres)

// Tests and development use `.env`; production builds use `.env.production`.
// An explicit deployment/CI DATABASE_URL always keeps priority over local files.
const productionBuild = process.argv.includes("--production")
nextEnv.loadEnvConfig(projectRoot, !productionBuild)

const databaseUrl = process.env.DATABASE_URL?.trim() ?? ""
const schemaPath = databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://")
  ? targetPath
  : databaseUrl.startsWith("file:")
    ? sourcePath
    : null

if (!schemaPath) {
  throw new Error("DATABASE_URL doit utiliser SQLite (file:) ou PostgreSQL (postgresql:/postgres:)")
}

const prismaCliPath = path.join(projectRoot, "node_modules", "prisma", "build", "index.js")
const maximumAttempts = process.platform === "win32" ? 4 : 1

for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
  const generation = spawnSync(process.execPath, [prismaCliPath, "generate", "--schema", schemaPath], {
    cwd: projectRoot,
    encoding: "utf8",
    env: process.env,
  })

  if (generation.error) throw generation.error
  if (generation.status === 0) {
    process.stdout.write(generation.stdout ?? "")
    process.stderr.write(generation.stderr ?? "")
    break
  }

  const output = `${generation.stdout ?? ""}${generation.stderr ?? ""}`
  const canRetry = attempt < maximumAttempts && output.includes("EPERM")
  if (!canRetry) {
    process.stdout.write(generation.stdout ?? "")
    process.stderr.write(generation.stderr ?? "")
    process.exit(generation.status ?? 1)
  }

  const retryDelayMs = attempt * 750
  console.warn(`Moteur Prisma occupé, nouvelle tentative dans ${retryDelayMs} ms (${attempt}/${maximumAttempts})…`)
  await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
}
