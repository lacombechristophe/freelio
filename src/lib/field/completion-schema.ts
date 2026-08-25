import { z } from "zod"

const completionMaterialSchema = z.object({
  warehouseId: z.string().cuid(),
  productId: z.string().cuid(),
  quantity: z.coerce.number().int().min(1).max(100_000),
})

const completionExpenseSchema = z.object({
  sourceId: z.string().uuid(),
  label: z.string().trim().min(2).max(180),
  category: z.enum(["TRAVEL", "TOLL", "PARKING", "MEAL", "SUPPLIES", "OTHER"]),
  amountCents: z.coerce.number().int().min(1).max(100_000_000),
  tvaCents: z.coerce.number().int().min(0).max(100_000_000).default(0),
  notes: z.string().trim().max(2_000).optional().transform((value) => value || null),
}).refine((value) => value.tvaCents <= value.amountCents, { path: ["tvaCents"], message: "La TVA ne peut pas dépasser le montant" })

const completionReservationSchema = z.object({
  sourceId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  details: z.string().trim().max(2_000).optional().transform((value) => value || null),
  severity: z.enum(["MINOR", "MAJOR", "BLOCKING"]).default("MINOR"),
})

export const interventionCompletionSchema = z.object({
  interventionId: z.string().cuid(),
  report: z.string().trim().min(3, "Le compte rendu est requis").max(10_000),
  laborMinutes: z.coerce.number().int().min(0).max(7 * 24 * 60),
  customerName: z.string().trim().min(2, "Le nom du client est requis").max(160),
  customerApproval: z.literal(true, { error: "L’accord du client doit être confirmé" }),
  customerSignatureData: z.string().min(100, "La signature manuscrite est requise").max(1_500_000).refine(
    (value) => /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value),
    "Format de signature invalide",
  ),
  materials: z.array(completionMaterialSchema).max(100).default([]),
  expenses: z.array(completionExpenseSchema).max(50).default([]),
  reservations: z.array(completionReservationSchema).max(20).default([]),
}).superRefine((value, context) => {
  const materialKeys = value.materials.map((item) => `${item.warehouseId}:${item.productId}`)
  if (new Set(materialKeys).size !== materialKeys.length) context.addIssue({ code: "custom", path: ["materials"], message: "Regroupez les lignes de matériel identiques" })
  const expenseIds = value.expenses.map((item) => item.sourceId)
  if (new Set(expenseIds).size !== expenseIds.length) context.addIssue({ code: "custom", path: ["expenses"], message: "Un frais apparaît plusieurs fois" })
  const reservationIds = value.reservations.map((item) => item.sourceId)
  if (new Set(reservationIds).size !== reservationIds.length) context.addIssue({ code: "custom", path: ["reservations"], message: "Une réserve apparaît plusieurs fois" })
})
