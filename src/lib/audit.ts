import prisma from "./prisma"

type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "CREATE_CLIENT"
  | "UPDATE_CLIENT"
  | "DELETE_CLIENT"
  | "CREATE_CLIENT_PORTAL_ACCESS"
  | "REVOKE_CLIENT_PORTAL_ACCESS"
  | "SEND_CLIENT_PORTAL_MESSAGE"
  | "UPDATE_CLIENT_PORTAL_APPOINTMENT"
  | "SEND_CRM_EMAIL"
  | "UPDATE_EMAIL_THREAD"
  | "UPDATE_COMMUNICATION_CHANNEL"
  | "CREATE_OPPORTUNITY"
  | "UPDATE_OPPORTUNITY"
  | "DELETE_OPPORTUNITY"
  | "CREATE_PROJECT"
  | "CREATE_PROJECT_TEMPLATE"
  | "UPDATE_PROJECT_MILESTONE_PLAN"
  | "UPDATE_PROJECT"
  | "DELETE_PROJECT"
  | "CREATE_QUOTE"
  | "UPDATE_QUOTE"
  | "UPDATE_QUOTE_STATUS"
  | "DELETE_QUOTE"
  | "CREATE_INVOICE"
  | "CREATE_INVOICE_FROM_TIME"
  | "CREATE_INVOICE_FROM_ORDER"
  | "UPDATE_INVOICE"
  | "UPDATE_INVOICE_STATUS"
  | "DELETE_INVOICE"
  | "RECORD_PAYMENT"
  | "CREATE_CONTRACT"
  | "UPDATE_CONTRACT"
  | "SIGN_CONTRACT"
  | "DELETE_CONTRACT"
  | "CREATE_EXPENSE"
  | "UPDATE_EXPENSE"
  | "DELETE_EXPENSE"
  | "GENERATE_PDF"
  | "OCR_EXPENSE"
  | "UPDATE_SETTINGS"
  | "CREATE_CUSTOMER_ORDER"
  | "CONSUME_STOCK_RESERVATION"
  | "UPDATE_PROJECT_TECHNICAL_PROFILE"
  | "COMPLETE_FIELD_INTERVENTION"
  | "UPDATE_FIELD_INTERVENTION_PLAN"
  | "RESOLVE_INTERVENTION_RESERVATION"
  | "CONSUME_INTERVENTION_MATERIAL"
  | "CREATE_MAINTENANCE_CONTRACT"
  | "SIGN_DELIVERY_NOTE"
  | "SCHEDULE_MAINTENANCE_VISIT"
  | "CREATE_CATALOG_PRODUCT"
  | "UPDATE_CATALOG_PRODUCT"
  | "UPDATE_PRODUCT_CONFIGURATION"
  | "CREATE_PURCHASE_ORDER"
  | "SUBMIT_PURCHASE_ORDER"
  | "APPROVE_PURCHASE_ORDER"
  | "SEND_PURCHASE_ORDER"
  | "ACKNOWLEDGE_PURCHASE_ORDER"
  | "RECEIVE_PURCHASE_ORDER"
  | "RESOLVE_PURCHASE_ISSUE"
  | "CREATE_SUPPLIER_RETURN"
  | "CREDIT_SUPPLIER_RETURN"

interface AuditParams {
  userId: string
  action: AuditAction
  resource: string
  resourceId?: string
  payload?: unknown
  ipAddress?: string
}

export async function logAction({
  userId,
  action,
  resource,
  resourceId,
  payload,
  ipAddress
}: AuditParams) {
  try {
    return await prisma.auditLog.create({
      data: {
        userId: userId as string,
        action,
        resource,
        resourceId,
        payload: payload ? JSON.parse(JSON.stringify(payload)) : undefined,
        ipAddress: ipAddress as string | undefined,
      }
    })
  } catch (error) {
    console.error("Failed to log audit action:", error)
    // We don't throw here to avoid failing the main action just because logging failed
  }
}
