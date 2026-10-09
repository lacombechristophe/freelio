import { PrismaClient } from "@prisma/client"
import { getContext } from "./context"
import { canActionPermissionMutateModel, hasPermission, requiredMutationPermission } from "./permissions"
import { COMPANY_SCOPED_MODELS, companyRelationScope } from "./tenant-scope"
import { assertDemoMutationAllowed, isPublicReadOnlyDemo } from "./demo-policy"
import { mailboxScope, scopeMailboxIncludes } from "./communications/mailbox-access"

const MUTATION_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"])

const TENANT_READ_OPERATIONS = new Set(["aggregate", "count", "findFirst", "findFirstOrThrow", "findMany", "findUnique", "findUniqueOrThrow", "groupBy"])

const TENANT_CREATE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn"])
const TENANT_UPDATE_OPERATIONS = new Set(["update", "updateMany", "updateManyAndReturn"])
const SERVICE_PROFILE_FIELDS = new Set(["successOwnerMembershipId", "renewalAt", "nextActionAt", "nextActionLabel", "successPlan", "expansionNotes"])

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
  const recurring = { AND: [
    { OR: [{ projectId: null }, { project: direct }] },
    { OR: [{ maintenanceContractId: null }, { maintenanceContract: { site: direct } }] },
    { OR: [{ projectId: { not: null } }, { maintenanceContractId: { not: null } }] },
  ] }
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
    RecurringInvoice: recurring,
    RecurringInvoiceOccurrence: { recurring },
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

function validateDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (databaseUrl && !databaseUrl.startsWith("file:") && !databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) {
    throw new Error("DATABASE_URL doit utiliser SQLite (file:) ou PostgreSQL")
  }
}

/**
 * Prisma Singleton with Lazy Proxy
 *
 * We use a Proxy to defer PrismaClient instantiation until the first property access.
 * This resolves build-time errors (Failed to collect page data) in Next.js/Turbopack
 * where modules are evaluated in environments that lack database connectivity.
 */

const prismaClientSingleton = () => {
  validateDatabaseUrl()
  return new PrismaClient().$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        if (!model && isPublicReadOnlyDemo()) {
          // Raw SQL can mutate even when exposed through $queryRaw. The only
          // supported raw read in a public demo is the readiness probe.
          const rawArgs = args as { sql?: string } | unknown[]
          const sql = !Array.isArray(rawArgs) && rawArgs && "sql" in rawArgs ? rawArgs.sql : Array.isArray(rawArgs) && Array.isArray(rawArgs[0]) ? rawArgs[0].join("") : undefined
          if (operation !== "$queryRaw" || sql?.trim().toUpperCase() !== "SELECT 1") assertDemoMutationAllowed()
        }
        return query(args)
      },
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (MUTATION_OPERATIONS.has(operation) && !(model === "AuditLog" && operation === "create")) assertDemoMutationAllowed()
          const context = getContext()
          // Prisma exposes a union of every model operation here. The operation
          // guards below narrow it at runtime; a mutable view keeps the scoping
          // code readable without weakening the public Prisma client types.
          const mutableArgs = args as any

          const requiredPermission = requiredMutationPermission(model)
          const profileFields = Object.keys(mutableArgs.data ?? {})
          // Service can edit its follow-up fields, never the general client or money.
          const serviceProfileUpdate = model === "Client" && operation === "update" && context?.actionPermission === "service.write" &&
            hasPermission(context.role, "service.write") && profileFields.length > 0 && profileFields.every(field => SERVICE_PROFILE_FIELDS.has(field))
          // Finance claims billing only; it cannot edit the operational order.
          const orderBillingUpdate = model === "CustomerOrder" && operation === "updateMany" && context?.actionPermission === "finance.write" &&
            hasPermission(context.role, "finance.write") && profileFields.length === 1 && profileFields[0] === "billingStatus"

          if (
            context &&
            requiredPermission &&
            MUTATION_OPERATIONS.has(operation) &&
            !hasPermission(context.role, requiredPermission) &&
            !serviceProfileUpdate &&
            !orderBillingUpdate &&
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

          if (context) {
            if (["EmailDraft", "EmailSignature"].includes(model) && MUTATION_OPERATIONS.has(operation)) {
              for (const data of [mutableArgs.data, mutableArgs.create, mutableArgs.update].flat().filter(Boolean)) {
                const author = data.authorUserId ?? data.author?.connect?.id
                if (author !== undefined && author !== context.userId) throw new Error("DRAFT_ACCESS_DENIED")
                if (TENANT_CREATE_OPERATIONS.has(operation) || data === mutableArgs.create) data.authorUserId = context.userId
              }
            }
            const scope = mailboxScope(model, context)
            if (scope && !TENANT_CREATE_OPERATIONS.has(operation)) appendWhereScope(mutableArgs, scope)
            scopeMailboxIncludes(model, mutableArgs, context)
            if (!["OWNER", "ADMIN"].includes(context.role) && MUTATION_OPERATIONS.has(operation)) {
              const link = model === "EmailMessage" ? "threadId" : model === "OrganisationTask" ? "calendarChannelId" : ["EmailThread", "EmailDelivery", "AutomationEventOutbox"].includes(model) ? "channelId" : null
              if (link) {
                for (const data of [mutableArgs.data, mutableArgs.create, mutableArgs.update].flat().filter(Boolean)) {
                  const linkedId = data[link] ?? data[link === "threadId" ? "thread" : link === "calendarChannelId" ? "calendarChannel" : "channel"]?.connect?.id
                  if (typeof linkedId !== "string") continue
                  const allowed = link === "threadId" ? await getPrisma().emailThread.count({ where: { id: linkedId } }) : await getPrisma().communicationChannel.count({ where: { id: linkedId } })
                  if (allowed !== 1) throw new Error("MAILBOX_ACCESS_DENIED")
                }
              }
            }
          }

          return query(mutableArgs)
        },
      },
    },
  })
}

type PrismaClientExtended = ReturnType<typeof prismaClientSingleton>
export type TransactionClient = Parameters<Parameters<PrismaClientExtended["$transaction"]>[0]>[0]

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
    if (isPublicReadOnlyDemo() && ["$executeRaw", "$executeRawUnsafe", "$queryRawUnsafe"].includes(String(prop))) assertDemoMutationAllowed()
    // If the property is being accessed, we instantiate the real client
    const client = getPrisma()
    const value = (client as any)[prop]

    // If the property is a function, we must bind it to the client to preserve 'this'
    if (typeof value === "function") {
      if (prop === "$queryRaw" && isPublicReadOnlyDemo()) {
        return (query: TemplateStringsArray) => {
          if (!Array.isArray(query) || query.length !== 1 || query[0].trim().toUpperCase() !== "SELECT 1") assertDemoMutationAllowed()
          return value.call(client, query)
        }
      }
      return value.bind(client)
    }

    return value
  },
})

export default prisma
