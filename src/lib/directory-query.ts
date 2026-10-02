import { z } from "zod"

export const directoryQuerySchema = z.object({
  search: z.string().max(200).default(""),
  status: z.string().max(30).default("ALL"),
  page: z.number().int().min(1).max(100000).default(1),
  columns: z.array(z.string().max(100)).max(100).default(["type", "revenue", "unpaid", "relation"]),
  filters: z.array(z.object({ id: z.string().max(100), field: z.string().max(100), operator: z.enum(["contains", "equals", "not_equals", "greater_than", "less_than", "is_empty", "is_not_empty"]), value: z.string().max(200) })).max(20).default([]),
  sort: z.object({ field: z.string().max(100), direction: z.enum(["asc", "desc"]) }).default({ field: "name", direction: "asc" }),
})
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>
export const DIRECTORY_PAGE_SIZE = 25

export function parseDirectoryQuery(value: string | null): DirectoryQuery {
  try {
    const parsed = directoryQuerySchema.safeParse(value ? JSON.parse(value) : {})
    if (parsed.success) return parsed.data
  } catch { /* Malformed shared URLs fall back to the default view. */ }
  return directoryQuerySchema.parse({})
}

export function matchesDirectoryFilter(value: unknown, filter: DirectoryQuery["filters"][number]) {
  const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0)
  if (filter.operator === "is_empty") return empty
  if (filter.operator === "is_not_empty") return !empty
  if (empty) return false
  const values = (Array.isArray(value) ? value : [value]).map((item) => String(item).toLocaleLowerCase("fr"))
  const expected = filter.value.trim().toLocaleLowerCase("fr")
  if (filter.operator === "contains") return values.some((item) => item.includes(expected))
  if (filter.operator === "equals") return values.includes(expected)
  if (filter.operator === "not_equals") return !values.includes(expected)
  const scalar = Array.isArray(value) ? value[0] : value
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(scalar)) && /^\d{4}-\d{2}-\d{2}$/.test(filter.value)) {
    return filter.operator === "greater_than" ? String(scalar) > filter.value : String(scalar) < filter.value
  }
  const actual = Number(scalar), target = Number(filter.value.replace(",", "."))
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return false
  return filter.operator === "greater_than" ? actual > target : actual < target
}

export function compareDirectoryValues(left: unknown, right: unknown) {
  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1
  return typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "fr", { numeric: true, sensitivity: "base" })
}
