import nextEnv from "@next/env"
import { defineConfig } from "prisma/config"
import { databaseConnectionUrl } from "./src/lib/database-url.ts"

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production")
const databaseUrl = process.env.DATABASE_URL?.trim() ?? ""
const postgres = databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://")
if (!postgres && !databaseUrl.startsWith("file:")) throw new Error("DATABASE_URL doit utiliser SQLite (file:) ou PostgreSQL")
const url = databaseConnectionUrl(databaseUrl)

export default defineConfig({
  schema: postgres ? "prisma/postgresql/schema.prisma" : "prisma/schema.prisma",
  ...(postgres ? { migrations: { path: "prisma/postgresql/migrations" } } : {}),
  datasource: { url },
})
