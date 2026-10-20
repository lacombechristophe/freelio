import { z } from "zod"

export const mailIdSchema = z.object({ id: z.string().min(1).max(2048), newReceipt: z.boolean(), sentHint: z.boolean().optional() })
export type MailId = z.infer<typeof mailIdSchema>

export const mailSyncStateSchema = z.object({
  version: z.literal(2), generation: z.string().max(200), phase: z.enum(["BOOTSTRAP", "RECONCILE", "CHANGES"]),
  since: z.string().datetime(), startedAt: z.string().datetime(), folder: z.union([z.literal(0), z.literal(1)]), continuation: z.string().max(20_000).nullable(),
  receptionSince: z.string().datetime(), roundStartedAt: z.string().datetime().nullable(),
  googleHistoryId: z.string().max(1000).nullable(), graphCursors: z.tuple([z.string().max(20_000).nullable(), z.string().max(20_000).nullable()]),
  graphFolders: z.tuple([z.string().min(1).max(2048), z.string().min(1).max(2048)]),
  reconcileUntil: z.string().max(200).nullable(), reconcileAfter: z.string().max(200).nullable(), initialised: z.boolean(),
  pendingPage: z.object({ ids: z.array(mailIdSchema).max(50_000), position: z.number().int().min(0), continuation: z.string().max(20_000).nullable(), checkpoint: z.string().max(20_000).nullable() })
    .refine(page => page.position <= page.ids.length).nullable().default(null),
})
export type MailSyncState = z.infer<typeof mailSyncStateSchema>
