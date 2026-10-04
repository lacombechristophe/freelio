import "server-only"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { signatureTextSchema, type EmailSignatureDto } from "./signature-input"

export class EmailSignatureConflict extends Error {}
const saveSchema = z.object({ text: signatureTextSchema, version: z.number().int().positive().nullable() })
const projection = { text: true, version: true } as const

export async function getEmailSignature(companyId: string, userId: string): Promise<EmailSignatureDto> {
  return await prisma.emailSignature.findUnique({ where: { companyId_authorUserId: { companyId, authorUserId: userId } }, select: projection }) || { text: "", version: null }
}

export async function saveEmailSignature(companyId: string, userId: string, input: unknown): Promise<EmailSignatureDto> {
  const data = saveSchema.parse(input)
  const where = { companyId, authorUserId: userId }
  const conflict = () => new EmailSignatureConflict("Cette signature a changé dans un autre onglet. Votre texte est conservé ; rechargez la page avant de la remplacer")
  if (data.version === null) {
    const saved = await prisma.emailSignature.upsert({ where: { companyId_authorUserId: where }, update: {}, create: { ...where, text: data.text }, select: projection }).catch(async error => {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error
      return prisma.emailSignature.findUniqueOrThrow({ where: { companyId_authorUserId: where }, select: projection })
    })
    if (saved.text !== data.text || saved.version !== 1) throw conflict()
    return saved
  }
  const version = data.version
  return prisma.$transaction(async tx => {
    const saved = await tx.emailSignature.updateMany({ where: { ...where, version }, data: { text: data.text, version: { increment: 1 } } })
    if (saved.count !== 1) throw conflict()
    return tx.emailSignature.findUniqueOrThrow({ where: { companyId_authorUserId: where }, select: projection })
  })
}
