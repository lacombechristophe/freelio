export const COMPANY_ROLES = [
  "OWNER",
  "ADMIN",
  "SALES",
  "OPERATIONS",
  "TECHNICIAN",
  "SERVICE",
  "ACCOUNTING",
  "VIEWER",
] as const

export type CompanyRole = (typeof COMPANY_ROLES)[number]

export const PERMISSIONS = [
  "company.manage",
  "members.manage",
  "crm.read",
  "crm.write",
  "sales.read",
  "sales.write",
  "operations.read",
  "operations.write",
  "purchases.approve",
  "service.read",
  "service.write",
  "finance.read",
  "finance.write",
  "migration.manage",
  "automation.read",
  "automation.write",
] as const

export type Permission = (typeof PERMISSIONS)[number]

const ALL_PERMISSIONS = new Set<Permission>(PERMISSIONS)

const ROLE_PERMISSIONS: Record<Exclude<CompanyRole, "OWNER">, ReadonlySet<Permission>> = {
  ADMIN: new Set(PERMISSIONS),
  SALES: new Set(["crm.read", "crm.write", "sales.read", "sales.write", "operations.read", "automation.read", "automation.write"]),
  OPERATIONS: new Set(["crm.read", "sales.read", "operations.read", "operations.write", "purchases.approve", "service.read", "automation.read"]),
  TECHNICIAN: new Set(["crm.read", "operations.read", "operations.write", "service.read", "service.write"]),
  SERVICE: new Set(["crm.read", "operations.read", "service.read", "service.write", "automation.read"]),
  ACCOUNTING: new Set(["crm.read", "sales.read", "operations.read", "purchases.approve", "finance.read", "finance.write"]),
  VIEWER: new Set(["crm.read", "sales.read", "operations.read", "service.read", "finance.read"]),
}

export function isCompanyRole(value: string): value is CompanyRole {
  return COMPANY_ROLES.includes(value as CompanyRole)
}

export function normalizeCompanyRole(value: string): CompanyRole {
  return isCompanyRole(value) ? value : "VIEWER"
}

export function hasPermission(role: CompanyRole, permission: Permission): boolean {
  if (role === "OWNER") return ALL_PERMISSIONS.has(permission)
  return ROLE_PERMISSIONS[role].has(permission)
}

export function canAssignRole(actorRole: CompanyRole, targetRole: CompanyRole): boolean {
  if (actorRole === "OWNER") return true
  if (actorRole !== "ADMIN") return false
  return targetRole !== "OWNER" && targetRole !== "ADMIN"
}

const MUTATION_PERMISSIONS: Partial<Record<string, Permission>> = {
  Company: "company.manage",
  Agency: "company.manage",
  AgencyMembership: "company.manage",
  Membership: "members.manage",
  CompanyInvitation: "members.manage",
  WebhookEndpoint: "company.manage",
  WebhookDelivery: "company.manage",
  ApiKey: "company.manage",
  DataSourceConnection: "migration.manage",
  MigrationRun: "migration.manage",
  SourceRecord: "migration.manage",
  ExternalIdMap: "migration.manage",
  MigrationIssue: "migration.manage",
  MigrationMetric: "migration.manage",
  DocumentManifest: "migration.manage",
  EmailTemplate: "automation.write",
  EmailSequence: "automation.write",
  EmailSequenceStep: "automation.write",
  EmailSequenceEnrollment: "automation.write",
  EmailSequenceTask: "automation.write",
  EmailDelivery: "automation.write",
  EmailThread: "automation.write",
  EmailMessage: "automation.write",
  EmailEvent: "automation.write",
  CommunicationChannel: "company.manage",
  LeadScoringRule: "automation.write",
  MarketingSegment: "automation.write",
  MarketingSegmentMember: "automation.write",
  MarketingCampaign: "automation.write",
  MarketingCampaignAsset: "automation.write",
  AutomationWorkflow: "automation.write",
  AutomationWorkflowVersion: "automation.write",
  AutomationRun: "automation.write",

  Client: "crm.write",
  Contact: "crm.write",
  ClientActivity: "crm.write",
  ClientFile: "crm.write",
  ClientPortalAccess: "crm.write",
  ClientPortalMessage: "crm.write",
  ClientPortalAppointmentRequest: "crm.write",
  CustomerSite: "crm.write",
  LeadCapture: "crm.write",
  MarketingConsent: "crm.write",

  Pipeline: "sales.write",
  Opportunity: "sales.write",
  OpportunityActivity: "sales.write",
  ServiceCategory: "sales.write",
  Service: "sales.write",
  Quote: "sales.write",
  QuoteVersion: "sales.write",
  QuoteSection: "sales.write",
  QuoteLine: "sales.write",
  ContractTemplate: "sales.write",
  Contract: "sales.write",
  ContractAmendmentChange: "sales.write",
  ContractClause: "sales.write",
  ContractSignature: "sales.write",
  ContractSigningToken: "sales.write",

  Project: "operations.write",
  ProjectTemplate: "operations.write",
  ProjectTemplateStep: "operations.write",
  ProjectMilestone: "operations.write",
  ProjectFile: "operations.write",
  ProjectTechnicalProfile: "operations.write",
  ProjectAcceptanceItem: "operations.write",
  TimeEntry: "operations.write",
  Supplier: "operations.write",
  Product: "operations.write",
  ProductOptionGroup: "operations.write",
  ProductOptionValue: "operations.write",
  ProductComponent: "operations.write",
  ProductPrice: "operations.write",
  Warehouse: "operations.write",
  InventoryItem: "operations.write",
  StockMovement: "operations.write",
  StockTransfer: "operations.write",
  PurchaseOrder: "operations.write",
  PurchaseOrderLine: "operations.write",
  PurchaseIssue: "operations.write",
  SupplierReturn: "operations.write",
  CustomerOrder: "operations.write",
  CustomerOrderLine: "operations.write",
  DeliveryNote: "operations.write",
  DeliveryNoteLine: "operations.write",
  GoodsReceipt: "operations.write",
  GoodsReceiptLine: "operations.write",
  StockReservation: "operations.write",
  Equipment: "operations.write",
  FieldIntervention: "operations.write",
  InterventionReservation: "operations.write",
  InterventionFile: "operations.write",
  MaintenanceContract: "operations.write",
  MaintenanceContractEquipment: "operations.write",
  ServiceTicket: "service.write",
  ServiceTicketNote: "service.write",
  ServiceDiagnosticGuide: "service.write",
  ServiceTicketDiagnostic: "service.write",
  CustomerHealthRule: "service.write",
  CustomerHealthSnapshot: "service.write",
  KnowledgeArticle: "service.write",
  SatisfactionSurvey: "service.write",
  SatisfactionRequest: "service.write",
  SavedView: "crm.write",
  OrganisationGoal: "operations.write",
  OrganisationTask: "operations.write",

  Invoice: "finance.write",
  InvoiceLine: "finance.write",
  InvoicePayment: "finance.write",
  InvoiceReminder: "finance.write",
  CreditNote: "finance.write",
  RecurringInvoice: "finance.write",
  RecurringInvoiceOccurrence: "finance.write",
  Expense: "finance.write",
  ExpenseFile: "finance.write",
  BankTransaction: "finance.write",
  RelanceConfig: "finance.write",
  EInvoiceLog: "finance.write",
  EReportingBatch: "finance.write",
}

export function requiredMutationPermission(model: string): Permission | undefined {
  return MUTATION_PERMISSIONS[model]
}

const ACTION_PERMISSION_MODEL_ALIASES: Partial<Record<Permission, ReadonlySet<string>>> = {
  "purchases.approve": new Set(["PurchaseOrder"]),
  "service.write": new Set(["EmailTemplate"]),
}

export function canActionPermissionMutateModel(permission: Permission | undefined, model: string): boolean {
  return Boolean(permission && ACTION_PERMISSION_MODEL_ALIASES[permission]?.has(model))
}
