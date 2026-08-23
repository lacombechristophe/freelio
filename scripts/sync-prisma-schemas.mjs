import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, "..")
const sourcePath = path.join(projectRoot, "prisma", "schema.prisma")
const targetPath = path.join(projectRoot, "prisma", "postgresql", "schema.prisma")

const source = await readFile(sourcePath, "utf8")
const postgres = source
  .replace('provider = "sqlite"', 'provider = "postgresql"')
  .replace(
    'generator client {\n  provider = "prisma-client-js"\n}',
    'generator client {\n  provider = "prisma-client-js"\n  output   = "../../node_modules/@diskoov/prisma-postgres"\n}',
  )

if (postgres === source) throw new Error("Impossible de produire le schéma Prisma PostgreSQL")
await mkdir(path.dirname(targetPath), { recursive: true })
await writeFile(targetPath, postgres)
