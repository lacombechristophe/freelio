import "server-only"

import { Prisma } from "@/generated/prisma/client"

// Prisma stores DateTime as UTC clock fields in PostgreSQL TIMESTAMP columns,
// but binds raw Date parameters as timestamptz. An implicit conversion would
// apply the database session's timezone to version checks and stored instants.
export function sqlTimestamp(value: Date) {
  return process.env.DATABASE_URL?.startsWith("file:")
    ? Prisma.sql`${value}`
    : Prisma.sql`CAST(${value.toISOString()} AS TIMESTAMP(3))`
}
