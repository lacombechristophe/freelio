import { z } from "zod"

export const connectionIdSchema = z.string().cuid()

export const providerSchema = z.enum(["HUBSPOT", "EXTRABAT"])
