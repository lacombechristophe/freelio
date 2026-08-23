import { PrismaClient } from "@prisma/client"
import { PrismaClient as PostgreSQLPrismaClient } from "@diskoov/prisma-postgres"
import { getContext } from "./context"
import { hasPermission, requiredMutationPermission } from "./permissions"

const MUTATION_OPERATIONS = new Set([
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
])

const COMPANY_SCOPED_MODELS = new Set([
  "Client",
  "Project",
  "Pipeline",
  "ServiceCategory",
  "Service",
  "Quote",
  "Invoice",
  "RecurringInvoice",
  "ContractTemplate",
  "Contract",
  "Expense",
  "WebhookEndpoint",
  "RelanceConfig",
  "OrganisationGoal",
  "OrganisationTask",
  "InvoiceReminder",
  "BankTransaction",
  "DataSourceConnection",
  "MigrationRun",
  "SourceRecord",
  "ExternalIdMap",
  "DocumentManifest",
  "CustomerSite",
  "Supplier",
  "Product",
  "Warehouse",
  "InventoryItem",
  "StockMovement",
  "PurchaseOrder",
  "Equipment",
  "ServiceTicket",
  "FieldIntervention",
  "MaintenanceContract",
  "LeadCapture",
  "MarketingConsent",
  "CustomerOrder",
  "DeliveryNote",
  "GoodsReceipt",
  "StockReservation",
])

function prismaClientConstructor() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://")) {
    return PostgreSQLPrismaClient as unknown as typeof PrismaClient
  }
  if (databaseUrl && !databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL doit utiliser SQLite (file:) ou PostgreSQL")
  }
  return PrismaClient
}

/**
 * Prisma Singleton with Lazy Proxy
 * 
 * We use a Proxy to defer PrismaClient instantiation until the first property access.
 * This resolves build-time errors (Failed to collect page data) in Next.js/Turbopack 
 * where modules are evaluated in environments that lack database connectivity.
 */

const prismaClientSingleton = () => {
  const RuntimePrismaClient = prismaClientConstructor()
  return new RuntimePrismaClient().$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const context = getContext()

          const requiredPermission = requiredMutationPermission(model)

          if (
            context &&
            requiredPermission &&
            MUTATION_OPERATIONS.has(operation) &&
            !hasPermission(context.role, requiredPermission)
          ) {
            throw new Error(`FORBIDDEN:${requiredPermission}`)
          }

          // Only these models own a direct companyId column in schema.prisma.
          if (context?.companyId && COMPANY_SCOPED_MODELS.has(model)) {
            if (operation === "findMany" || operation === "findFirst" || operation === "findUnique") {
              args.where = { ...args.where, companyId: context.companyId }
            } else if (operation === "create" || operation === "createMany") {
              if (Array.isArray(args.data)) {
                args.data = args.data.map((item: any) => ({ ...item, companyId: context.companyId }))
              } else {
                args.data = { ...args.data, companyId: context.companyId }
              }
            } else if (operation === "update" || operation === "updateMany" || operation === "upsert") {
              args.where = { ...args.where, companyId: context.companyId }
            } else if (operation === "delete" || operation === "deleteMany") {
              args.where = { ...args.where, companyId: context.companyId }
            }
          }
          
          return query(args)
        },
      },
    },
  })
}

type PrismaClientExtended = ReturnType<typeof prismaClientSingleton>

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientExtended | undefined
}

const getPrisma = (): PrismaClientExtended => {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = prismaClientSingleton()
  }
  return globalForPrisma.prisma
}

// The Proxy intercepts all property accesses and redirects them to the lazily-initialized client
const prisma = new Proxy({} as PrismaClientExtended, {
  get: (_target, prop) => {
    // If the property is being accessed, we instantiate the real client
    const client = getPrisma()
    const value = (client as any)[prop]
    
    // If the property is a function, we must bind it to the client to preserve 'this'
    if (typeof value === "function") {
      return value.bind(client)
    }
    
    return value
  }
})

export default prisma
