import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../generated/prisma/client.ts"
import { databaseConnectionUrl } from "./database-url.ts"

export function createDatabaseClient(url?: string) {
  const connection = databaseConnectionUrl(url)
  const adapter = connection.startsWith("file:")
    ? new PrismaBetterSqlite3({ url: connection }, { timestampFormat: "unixepoch-ms" })
    : new PrismaPg({ connectionString: connection, max: 10, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 300_000 }, { schema: new URL(connection).searchParams.get("schema") || "public" })
  return new PrismaClient({ adapter })
}
