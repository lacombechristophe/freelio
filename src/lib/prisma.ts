import { PrismaClient } from "@prisma/client"
import { PrismaClient as PostgreSQLPrismaClient } from "@crm/prisma-postgres"
import { getContext } from "./context"
import { canActionPermissionMutateModel, hasPermission, requiredMutationPermission } from "./permissions"

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
  "ClientPortalAccess",
  "ClientPortalMessage",
  "ClientPortalAppointmentRequest",
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
  "ProjectTemplate",
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
  "ProductOptionGroup",
  "ProductOptionValue",
  "ProductComponent",
  "ProductPrice",
  "Warehouse",
  "InventoryItem",
  "StockMovement",
  "StockTransfer",
  "PurchaseOrder",
  "PurchaseIssue",
  "SupplierReturn",
  "Equipment",
  "ServiceTicket",
  "ServiceTicketNote",
  "ServiceDiagnosticGuide",
  "ServiceTicketDiagnostic",
  "CustomerHealthRule",
  "CustomerHealthSnapshot",
  "KnowledgeArticle",
  "SatisfactionSurvey",
  "SatisfactionRequest",
  "SavedView",
  "FieldIntervention",
  "InterventionReservation",
  "MaintenanceContract",
  "LeadCapture",
  "MarketingConsent",
  "EmailTemplate",
  "EmailSequence",
  "EmailSequenceTask",
  "EmailDelivery",
  "EmailThread",
  "EmailMessage",
  "EmailEvent",
  "CommunicationChannel",
  "LeadScoringRule",
  "MarketingSegment",
  "MarketingCampaign",
  "AutomationWorkflow",
  "AutomationWorkflowVersion",
  "AutomationRun",
  "CustomerOrder",
  "DeliveryNote",
  "GoodsReceipt",
  "StockReservation",
])

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
    GoodsReceipt: { warehouse: direct },
    StockReservation: { warehouse: direct },
    SupplierReturn: { warehouse: direct },
    Equipment: { site: direct },
    ServiceTicket: { site: direct },
    FieldIntervention: { site: direct },
    MaintenanceContract: { site: direct },
    CustomerOrder: { project: direct },
    DeliveryNote: { customerOrder: { project: direct } },
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
  if (operation === "createMany") (Array.isArray(args.data) ? args.data : [args.data]).forEach(validate)
  if (operation === "update" || operation === "updateMany") {
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


          if (context?.agencyIds !== null && context?.agencyIds !== undefined) {
            const scope = agencyWhere(model, context.agencyIds)
            if (scope && operation !== "create" && operation !== "createMany") {
              const scopedArgs = args as { where?: Record<string, unknown> }
              const existingAnd = scopedArgs.where?.AND
              scopedArgs.where = {
                ...scopedArgs.where,
                AND: [...(Array.isArray(existingAnd) ? existingAnd : existingAnd ? [existingAnd] : []), scope],
              }
            }
            enforceAgencyWrite(model, operation, args, context.agencyIds)
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
