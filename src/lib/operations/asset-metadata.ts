import "server-only"

import { z } from "zod"

const text = (maximum: number) => z.string().trim().max(maximum).nullable().transform(value => value || null)
const coordinate = (minimum: number, maximum: number) => z.preprocess(value => {
  if (value === null || typeof value === "string" && value.trim() === "") return null
  return typeof value === "string" ? Number(value) : value
}, z.number().finite().min(minimum).max(maximum).nullable())
const date = z.union([z.string().datetime(), z.literal(""), z.null()]).transform(value => value || null).refine(value => {
  if (!value) return true
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value.slice(0, 10)
}, "Date invalide").transform(value => value ? new Date(value) : null)

export const siteMetadataSchema = z.object({
  label: z.string().trim().min(2).max(120), kind: z.string().trim().min(2).max(40),
  address1: z.string().trim().min(3).max(200), address2: text(2_000), postalCode: text(20), city: text(100),
  country: z.string().trim().min(2).max(100), accessNotes: text(2_000), latitude: coordinate(-90, 90), longitude: coordinate(-180, 180),
})

export const equipmentMetadataSchema = z.object({
  label: z.string().trim().min(2).max(160), category: text(100), manufacturer: text(120), model: text(120), serialNumber: text(120),
  productId: z.string().cuid().nullable(), installedAt: date, warrantyUntil: date, notes: text(2_000),
})
