import { AsyncLocalStorage } from "node:async_hooks"
import basePrisma from "@/lib/prisma"

// Helpers called by an import record must use the same transaction as its mapping.
type ImportTransaction = Parameters<Parameters<typeof basePrisma.$transaction>[0]>[0]
const transactions = new AsyncLocalStorage<ImportTransaction>()
export const migrationDatabase = new Proxy(basePrisma, {
  get(target, property) {
    const transaction = transactions.getStore()
    if (!transaction) return Reflect.get(target, property)
    if (property === "$transaction") {
      return (operation: ((client: ImportTransaction) => Promise<unknown>) | Promise<unknown>[]) =>
        typeof operation === "function" ? operation(transaction) : Promise.all(operation)
    }
    const value = Reflect.get(transaction, property)
    return typeof value === "function" ? value.bind(transaction) : value
  },
})

export function withMigrationRecordTransaction<T>(operation: () => Promise<T>) {
  return basePrisma.$transaction(
    transaction => transactions.run(transaction, operation),
    { timeout: 30_000 },
  )
}
