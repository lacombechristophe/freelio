import { PrismaClient } from "@prisma/client"

// Recipe only. Production roles belong to a reviewed infrastructure release.
const url = new URL(process.env.DATABASE_URL || "")
const database = decodeURIComponent(url.pathname.slice(1))
if (process.env.RECIPE_ISOLATED !== "true" || process.env.NODE_ENV === "production" || !["127.0.0.1", "localhost"].includes(url.hostname) || !database.startsWith("freelio_demo_")) throw Error("Une base PostgreSQL locale de démonstration isolée est requise")
const password = process.env.DEMO_READER_PASSWORD
if (!password || password.length < 24) throw Error("DEMO_READER_PASSWORD doit contenir au moins 24 caractères")
const client = new PrismaClient()
try {
  const existing = await client.$queryRaw`SELECT rolname FROM pg_roles WHERE rolname = 'freelio_demo_reader'`
  if (existing.length) throw Error("Le rôle existe déjà ; aucune modification implicite de ses droits n’est autorisée")
  // format(%L) quotes the generated password inside PostgreSQL. Never print SQL.
  const [{ sql }] = await client.$queryRaw`SELECT format('CREATE ROLE freelio_demo_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', ${password}) AS sql`
  await client.$executeRawUnsafe(sql)
  const [{ grant }] = await client.$queryRaw`SELECT format('GRANT CONNECT ON DATABASE %I TO freelio_demo_reader', ${database}) AS grant`
  await client.$executeRawUnsafe(grant)
  await client.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO freelio_demo_reader')
  await client.$executeRawUnsafe('GRANT SELECT ON ALL TABLES IN SCHEMA public TO freelio_demo_reader')
  // PDF consultation adds an audit event, never changes an existing event.
  await client.$executeRawUnsafe('GRANT INSERT ON TABLE public."AuditLog" TO freelio_demo_reader')
  console.log(JSON.stringify({ role: "freelio_demo_reader", database, grants: ["SELECT", "AuditLog INSERT"], superuser: false }))
} catch {
  // Prisma diagnostics can include a failed SQL statement containing a secret.
  console.error("Création du rôle de démonstration interrompue ; consulter les droits avec l’administrateur de la recette.")
  process.exitCode = 1
} finally {
  await client.$disconnect()
}
