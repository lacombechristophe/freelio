export type NotificationQuery = { search: string; status: "ALL" | "UNREAD" | "READ"; page: number }

export function parseNotificationQuery(value: unknown): NotificationQuery {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const page = typeof input.page === "string" || typeof input.page === "number" ? Number(input.page) : 1
  return {
    search: typeof input.search === "string" ? input.search.trim().slice(0, 200) : "",
    status: input.status === "UNREAD" || input.status === "READ" ? input.status : "ALL",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  }
}
