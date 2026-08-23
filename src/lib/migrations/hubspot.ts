import "server-only"

const HUBSPOT_API = "https://api.hubapi.com"
const API_VERSION = "2026-03"

export const HUBSPOT_OBJECTS = [
  "contacts",
  "companies",
  "leads",
  "deals",
  "tickets",
  "calls",
  "emails",
  "meetings",
  "notes",
  "tasks",
  "communications",
  "appointments",
  "products",
  "line_items",
  "quotes",
  "orders",
  "invoices",
  "payments",
  "subscriptions",
  "discounts",
  "fees",
  "taxes",
  "feedback_submissions",
  "marketing_events",
  "projects",
] as const

export type HubSpotObjectType = string

type HubSpotErrorPayload = {
  message?: string
  category?: string
  correlationId?: string
}

export class HubSpotApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly category?: string,
  ) {
    super(message)
    this.name = "HubSpotApiError"
  }
}

async function hubSpotRequest<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${HUBSPOT_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as HubSpotErrorPayload
    throw new HubSpotApiError(
      payload.message || `HubSpot a répondu ${response.status}`,
      response.status,
      payload.category,
    )
  }

  return response.json() as Promise<T>
}

type HubSpotProperty = {
  name: string
  label?: string
  type?: string
  fieldType?: string
  groupName?: string
  archived?: boolean
  hidden?: boolean
  hubspotDefined?: boolean
  options?: unknown[]
}

export async function testHubSpotConnection(accessToken: string) {
  const response = await hubSpotRequest<{ results: unknown[] }>(
    accessToken,
    `/crm/objects/${API_VERSION}/contacts?limit=1&archived=false`,
  )
  return { reachable: true, sampleCount: response.results.length }
}

async function discoverObject(accessToken: string, objectType: HubSpotObjectType, displayName?: string) {
  try {
    const [properties, sample] = await Promise.all([
      hubSpotRequest<{ results: HubSpotProperty[] }>(
        accessToken,
        `/crm/properties/${API_VERSION}/${objectType}?dataSensitivity=non_sensitive`,
      ),
      hubSpotRequest<{ results: unknown[] }>(
        accessToken,
        `/crm/objects/${API_VERSION}/${objectType}?limit=1&archived=false`,
      ),
    ])
    return {
      objectType,
      displayName: displayName ?? objectType,
      accessible: true as const,
      propertyCount: properties.results.length,
      hasRecords: sample.results.length > 0,
      properties: properties.results,
    }
  } catch (error) {
    return {
      objectType,
      displayName: displayName ?? objectType,
      accessible: false as const,
      propertyCount: 0,
      hasRecords: false,
      properties: [] as HubSpotProperty[],
      error: error instanceof Error ? error.message : "Accès impossible",
    }
  }
}

export async function discoverHubSpot(accessToken: string) {
  const results: Awaited<ReturnType<typeof discoverObject>>[] = []
  for (let index = 0; index < HUBSPOT_OBJECTS.length; index += 3) {
    const batch = HUBSPOT_OBJECTS.slice(index, index + 3)
    results.push(...await Promise.all(batch.map((objectType) => discoverObject(accessToken, objectType))))
  }
  try {
    const schemas = await hubSpotRequest<{ results: Array<{ objectTypeId: string; labels?: { singular?: string; plural?: string }; archived?: boolean }> }>(
      accessToken,
      `/crm-object-schemas/${API_VERSION}/schemas`,
    )
    const customSchemas = schemas.results.filter((schema) => !schema.archived && schema.objectTypeId.startsWith("2-"))
    for (let index = 0; index < customSchemas.length; index += 3) {
      const batch = customSchemas.slice(index, index + 3)
      results.push(...await Promise.all(batch.map((schema) => discoverObject(accessToken, schema.objectTypeId, schema.labels?.plural || schema.labels?.singular))))
    }
  } catch {
    // Custom-object access depends on the account plan and scopes. Standard
    // objects remain exportable even when schema discovery is unavailable.
  }
  return results
}

const ASSOCIATIONS: Record<string, string[]> = {
  contacts: ["companies", "deals", "tickets"],
  companies: ["contacts", "deals", "tickets"],
  leads: ["contacts", "companies", "deals"],
  deals: ["contacts", "companies", "line_items", "quotes"],
  tickets: ["contacts", "companies", "deals"],
  calls: ["contacts", "companies", "deals", "tickets"],
  emails: ["contacts", "companies", "deals", "tickets"],
  meetings: ["contacts", "companies", "deals", "tickets"],
  notes: ["contacts", "companies", "deals", "tickets"],
  tasks: ["contacts", "companies", "deals", "tickets"],
  communications: ["contacts", "companies", "deals", "tickets"],
  appointments: ["contacts", "companies", "deals", "tickets"],
  line_items: ["deals", "quotes"],
  quotes: ["deals", "line_items"],
  orders: ["contacts", "companies", "deals", "line_items"],
  invoices: ["contacts", "companies", "deals", "line_items"],
  payments: ["contacts", "companies", "invoices", "subscriptions"],
  subscriptions: ["contacts", "companies", "deals", "line_items"],
  discounts: ["quotes", "invoices", "line_items"],
  fees: ["quotes", "invoices", "line_items"],
  taxes: ["quotes", "invoices", "line_items"],
  feedback_submissions: ["contacts", "tickets"],
  marketing_events: ["contacts", "companies"],
  projects: ["contacts", "companies", "deals", "tickets"],
}

export async function startHubSpotExport(input: {
  accessToken: string
  objectType: HubSpotObjectType
  propertyNames: string[]
  exportName: string
}) {
  return hubSpotRequest<{ id: string }>(input.accessToken, `/crm/exports/${API_VERSION}/export/async`, {
    method: "POST",
    body: JSON.stringify({
      exportType: "VIEW",
      format: "CSV",
      exportName: input.exportName,
      objectProperties: input.propertyNames,
      associatedObjectType: (ASSOCIATIONS[input.objectType] ?? []).slice(0, 4),
      includeLabeledAssociations: true,
      includePrimaryDisplayPropertyForAssociatedObjects: true,
      objectType: input.objectType,
      language: "FR",
      exportInternalValuesOptions: ["NAMES", "VALUES"],
      overrideAssociatedObjectsPerDefinitionPerRowLimit: true,
    }),
  })
}

export type HubSpotExportStatus = {
  status: "CANCELED" | "COMPLETE" | "PENDING" | "PROCESSING"
  result?: string
  numErrors?: number
  errors?: unknown[]
}

export function getHubSpotExportStatus(accessToken: string, taskId: string) {
  return hubSpotRequest<HubSpotExportStatus>(
    accessToken,
    `/crm/exports/${API_VERSION}/export/async/tasks/${encodeURIComponent(taskId)}/status`,
  )
}

export async function downloadHubSpotExport(downloadUrl: string) {
  const url = new URL(downloadUrl)
  const host = url.hostname.toLowerCase()
  const allowed = url.protocol === "https:" && (
    host.endsWith(".hubspot.com") ||
    host.endsWith(".hubspotusercontent.com") ||
    host.endsWith(".hubspot.net") ||
    host === "hubspot.com"
  )
  if (!allowed) throw new Error("HubSpot a retourné une URL de téléchargement non autorisée")

  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`Téléchargement HubSpot impossible (${response.status})`)

  const contentLength = Number(response.headers.get("content-length") ?? 0)
  if (contentLength > 500 * 1024 * 1024) throw new Error("L'export HubSpot dépasse 500 Mo")
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > 500 * 1024 * 1024) throw new Error("L'export HubSpot dépasse 500 Mo")

  return {
    bytes,
    mimeType: response.headers.get("content-type") || "application/octet-stream",
    contentDisposition: response.headers.get("content-disposition"),
  }
}
