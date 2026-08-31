import { PrismaClient } from "@prisma/client"
import { PrismaClient as PostgreSQLPrismaClient } from "@crm/prisma-postgres"
import { getContext } from "./context"
import { canActionPermissionMutateModel, hasPermission, requiredMutationPermission } from "./permissions"
import { COMPANY_SCOPED_MODELS, companyRelationScope } from "./tenant-scope"

const MUTATION_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"])

const TENANT_READ_OPERATIONS = new Set(["aggregate", "count", "findFirst", "findFirstOrThrow", "findMany", "findUnique", "findUniqueOrThrow", "groupBy"])

const TENANT_CREATE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn"])
const TENANT_UPDATE_OPERATIONS = new Set(["update", "updateMany", "updateManyAndReturn"])

function appendWhereScope(args: { where?: Record<string, unknown> }, scope: Record<string, unknown>) {
  const existingAnd = args.where?.AND
  args.where = {
    ...args.where,
    AND: [...(Array.isArray(existingAnd) ? existingAnd : existingAnd ? [existingAnd] : []), scope],
  }
}

const DIRECT_AGENCY_MODELS = new Set(["CustomerSite", "Project", "Warehouse"])

function agencyWhere(model: string, agencyIds: string[]) {
  const direct = { agencyId: { in: agencyIds } }
  const scopes: Record<string, Record<string, unknown>> = {
    Agency: { id: { in: agencyIds } },
    CustomerSite: direct,
    Project: direct,
    Warehouse: direct,
    InventoryItem: { warehouse: direct },
    StockMovement: { warehouse: direct },
    StockTransfer: { AND: [{ fromWarehouse: direct }, { toWarehouse: direct }] },
    PurchaseOrder: { project: direct },
    Quote: { project: direct },
    Invoice: { project: direct },
    Expense: { OR: [{ project: direct }, { intervention: { site: direct } }] },
    GoodsReceipt: { warehouse: direct },
    StockReservation: { warehouse: direct },
    SupplierReturn: { warehouse: direct },
    Equipment: { site: direct },
    ServiceTicket: { site: direct },
    FieldIntervention: { site: direct },
    MaintenanceContract: { site: direct },
    CustomerOrder: { project: direct },
    CustomerOrderLine: { customerOrder: { project: direct } },
    DeliveryNote: { customerOrder: { project: direct } },
    DeliveryNoteLine: { deliveryNote: { customerOrder: { project: direct } } },
    GoodsReceiptLine: { goodsReceipt: { warehouse: direct } },
    PurchaseOrderLine: { purchaseOrder: { project: direct } },
    PurchaseIssue: { OR: [{ purchaseOrder: { project: direct } }, { goodsReceiptLine: { goodsReceipt: { warehouse: direct } } }] },
    ProjectAcceptanceItem: { project: direct },
    ProjectFile: { project: direct },
    ProjectMilestone: { project: direct },
    ProjectTechnicalProfile: { project: direct },
    TimeEntry: { project: direct },
    InvoiceLine: { invoice: { project: direct } },
    InvoicePayment: { invoice: { project: direct } },
    QuoteVersion: { quote: { project: direct } },
    QuoteSection: { version: { quote: { project: direct } } },
    QuoteLine: { section: { version: { quote: { project: direct } } } },
    ExpenseFile: { expense: { OR: [{ project: direct }, { intervention: { site: direct } }] } },
  }
  return scopes[model]
}

function enforceAgencyWrite(model: string, operation: string, args: any, agencyIds: string[]) {
  if (!DIRECT_AGENCY_MODELS.has(model)) return
  const validate = (data: Record<string, unknown>) => {
    if (!data.agencyId && agencyIds.length === 1) data.agencyId = agencyIds[0]
    if (typeof data.agencyId !== "string" || !agencyIds.includes(data.agencyId)) throw new Error("AGENCY_ACCESS_DENIED")
  }
  if (operation === "create") validate(args.data)
  if (operation === "createMany" || operation === "createManyAndReturn") (Array.isArray(args.data) ? args.data : [args.data]).forEach(validate)
  if (operation === "update" || operation === "updateMany" || operation === "updateManyAndReturn") {
    if (args.data?.agencyId !== undefined) validate(args.data)
  }
  if (operation === "upsert") {
    validate(args.create)
    if (args.update?.agencyId !== undefined) validate(args.update)
  }
}

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
          // Prisma exposes a union of every model operation here. The operation
          // guards below narrow it at runtime; a mutable view keeps the scoping
          // code readable without weakening the public Prisma client types.
          const mutableArgs = args as any

          const requiredPermission = requiredMutationPermission(model)

          if (
            context &&
            requiredPermission &&
            MUTATION_OPERATIONS.has(operation) &&
            !hasPermission(context.role, requiredPermission) &&
            !canActionPermissionMutateModel(context.actionPermission, model)
          ) {
            throw new Error(`FORBIDDEN:${requiredPermission}`)
          }

          const directCompanyScope = context?.companyId && COMPANY_SCOPED_MODELS.has(model) ? { companyId: context.companyId } : null
          const relationCompanyScope = context?.companyId ? companyRelationScope(model, context.companyId, context.userId) : null
          const tenantScope = directCompanyScope ?? relationCompanyScope

          if (context?.companyId && tenantScope) {
            if (TENANT_READ_OPERATIONS.has(operation)) {
              appendWhereScope(mutableArgs, tenantScope)
            } else if (directCompanyScope && TENANT_CREATE_OPERATIONS.has(operation)) {
              if (Array.isArray(mutableArgs.data)) {
                mutableArgs.data = mutableArgs.data.map((item: any) => ({ ...item, companyId: context.companyId }))
              } else {
                mutableArgs.data = { ...mutableArgs.data, companyId: context.companyId }
              }
            } else if (TENANT_UPDATE_OPERATIONS.has(operation)) {
              appendWhereScope(mutableArgs, tenantScope)
              if (directCompanyScope) mutableArgs.data = { ...mutableArgs.data, companyId: context.companyId }
            } else if (operation === "upsert") {
              appendWhereScope(mutableArgs, tenantScope)
              if (directCompanyScope) {
                mutableArgs.create = { ...mutableArgs.create, companyId: context.companyId }
                mutableArgs.update = { ...mutableArgs.update, companyId: context.companyId }
              }
            } else if (operation === "delete" || operation === "deleteMany") {
              appendWhereScope(mutableArgs, tenantScope)
            }
          }

          if (context?.agencyIds !== null && context?.agencyIds !== undefined) {
            const scope = agencyWhere(model, context.agencyIds)
            if (scope && !TENANT_CREATE_OPERATIONS.has(operation)) {
              appendWhereScope(mutableArgs, scope)
            }
            enforceAgencyWrite(model, operation, mutableArgs, context.agencyIds)
          }

          return query(mutableArgs)
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
  },
})

export default prisma
