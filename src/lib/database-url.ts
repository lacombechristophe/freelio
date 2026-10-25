import path from "node:path"
import { fileURLToPath } from "node:url"

/** Keep the schema-relative SQLite paths used before driver adapters. */
export function databaseConnectionUrl(value = process.env.DATABASE_URL ?? "") {
  const url = value.trim()
  if (url.startsWith("postgresql://") || url.startsWith("postgres://")) return url
  if (!url.startsWith("file:")) throw new Error("DATABASE_URL doit utiliser SQLite (file:) ou PostgreSQL")
  const file = url.startsWith("file://") ? fileURLToPath(url) : url.slice(5)
  return `file:${path.resolve(process.cwd(), "prisma", file).replaceAll("\\", "/")}`
}
