import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import nextEnv from "@next/env"

const { loadEnvConfig } = nextEnv
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, "..")

loadEnvConfig(projectRoot, true)

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error("DATABASE_URL est requis pour préparer la base de développement.")
  process.exit(1)
}

const prismaCli = path.join(projectRoot, "node_modules", "prisma", "build", "index.js")
const isSqlite = databaseUrl.startsWith("file:")
const isPostgres = databaseUrl.startsWith("postgresql:") || databaseUrl.startsWith("postgres:")

if (!isSqlite && !isPostgres) {
  console.error("DATABASE_URL doit cibler SQLite (file:) ou PostgreSQL (postgresql:/postgres:).")
  process.exit(1)
}

function runPrisma(args, options = {}) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    ...options,
  })

  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  return result
}

if (isSqlite) {
  const databaseFile = databaseUrl.slice("file:".length).split("?", 1)[0]
  const databasePath = path.isAbsolute(databaseFile)
    ? databaseFile
    : path.resolve(projectRoot, "prisma", databaseFile)

  if (!existsSync(databasePath)) {
    const diff = runPrisma(
      ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
    )
    runPrisma(
      ["db", "execute", "--stdin", "--schema", "prisma/schema.prisma"],
      { input: diff.stdout, stdio: ["pipe", "inherit", "inherit"] },
    )
  } else {
    runPrisma(["db", "push", "--schema", "prisma/schema.prisma"])
  }
  process.exit(0)
}

console.log("Base PostgreSQL détectée : contrôle non destructif de l’état des migrations.")
runPrisma(["migrate", "status", "--schema", "prisma/postgresql/schema.prisma"])
