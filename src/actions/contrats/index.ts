"use server"

import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { revalidatePath } from "next/cache"
import { logAction } from "@/lib/audit"
import { ContractSchema } from "@/lib/validations"
import {
  buildYearlyDocumentPrefix,
  nextDocumentNumber,
  withDocumentNumberRetry,
} from "@/lib/document-numbering"
import { compileContractVariables } from "@/lib/contracts/html"
import { signatureRateLimit } from "@/lib/rate-limit"
import { headers } from "next/headers"

type ContractInput = z.input<typeof ContractSchema>

export async function getContracts(cursor?: string, limit = 50) {
  return await withAuth(async ({ companyId }) => {
    return await prisma.contract.findMany({
      where: { companyId },
      take: limit,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      include: {
        client: { select: { id: true, name: true } },
        signatures: { select: { id: true, signerName: true, signedAt: true } },
      },
      orderBy: { createdAt: "desc" },
    })
  })
}

export async function getContractById(id: string) {
  return await withAuth(async ({ companyId }) => {
    return await prisma.contract.findFirst({
      where: { id, companyId },
      include: {
        client: true,
        company: true,
        signatures: true,
      },
    })
  })
}

async function generateContractNumber(companyId: string) {
  const prefix = buildYearlyDocumentPrefix("CONT-", "CONT-")
  const last = await prisma.contract.findFirst({
    where: { companyId, number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  })
  return nextDocumentNumber(last?.number, prefix)
}

export async function createContract(data: ContractInput) {
  return await withAuth(async ({ companyId, userId }) => {
    const validated = ContractSchema.parse(data)
    const contract = await withDocumentNumberRetry(async () => {
      const number = await generateContractNumber(companyId)
      const created = await prisma.contract.create({
        data: {
          companyId,
          clientId: validated.clientId,
          number,
          title: validated.title,
          status: "DRAFT",
          content: validated.content,
          validFrom: validated.validFrom ? new Date(validated.validFrom) : null,
          validUntil: validated.validUntil ? new Date(validated.validUntil) : null,
        },
      })
      await logAction({
        userId,
        action: "CREATE_CONTRACT",
        resource: "CONTRACT",
        resourceId: created.id,
        payload: { number },
      })
      return created
    }, { label: "le contrat" })
    revalidatePath("/dashboard/contrats")
    return contract
  })
}

export async function updateContract(id: string, data: ContractInput) {
  return await withAuth(async ({ companyId, userId }) => {
    const validated = ContractSchema.parse(data)
    const existing = await prisma.contract.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Contrat introuvable")
    if (existing.status === "SIGNED") throw new Error("Un contrat signé ne peut pas être modifié.")

    const contract = await prisma.contract.update({
      where: { id },
      data: {
        clientId: validated.clientId,
        title: validated.title,
        content: validated.content,
        validFrom: validated.validFrom ? new Date(validated.validFrom) : null,
        validUntil: validated.validUntil ? new Date(validated.validUntil) : null,
      },
    })
    await logAction({
      userId,
      action: "UPDATE_CONTRACT",
      resource: "CONTRACT",
      resourceId: id,
      payload: { number: contract.number },
    })
    revalidatePath("/dashboard/contrats")
    revalidatePath(`/dashboard/contrats/${id}`)
    return contract
  })
}

export async function updateContractStatus(
  contractId: string,
  status: "DRAFT" | "SENT" | "SIGNED" | "EXPIRED"
) {
  return await withAuth(async ({ userId, companyId }) => {
    const existing = await prisma.contract.findFirst({
      where: { id: contractId, companyId },
      include: { client: { include: { contacts: { orderBy: { isPrimary: "desc" } } } } },
    })
    if (!existing) throw new Error("Contrat introuvable")

    let signingPath: string | null = null
    const contract = await prisma.$transaction(async (tx) => {
      const updated = await tx.contract.update({
        where: { id: contractId },
        data: { status },
      })

      if (status === "SENT") {
        await tx.contractSigningToken.deleteMany({
          where: { contractId, usedAt: null },
        })
        const token = randomBytes(32).toString("base64url")
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        await tx.contractSigningToken.create({
          data: {
            contractId,
            tokenHash: createHash("sha256").update(token).digest("hex"),
            signerEmail: existing.client.contacts[0]?.email?.toLowerCase() || null,
            expiresAt,
          },
        })
        signingPath = `/sign/contracts/${token}`
      } else {
        await tx.contractSigningToken.deleteMany({ where: { contractId, usedAt: null } })
      }

      return updated
    })
    await logAction({
      userId,
      action: "SIGN_CONTRACT",
      resource: "CONTRACT",
      resourceId: contractId,
      payload: { status },
    })
    revalidatePath("/dashboard/contrats")
    revalidatePath(`/dashboard/contrats/${contractId}`)
    return { ...contract, signingPath }
  })
}

export async function deleteContract(id: string) {
  return await withAuth(async ({ companyId, userId }) => {
    const existing = await prisma.contract.findFirst({
      where: { id, companyId },
      include: { _count: { select: { signatures: true } } },
    })
    if (!existing) throw new Error("Contrat introuvable")
    if (existing.status === "SIGNED") throw new Error("Un contrat signé ne peut pas être supprimé.")

    // ContractSignature relation has no onDelete:Cascade — clear them first.
    if (existing._count.signatures > 0) {
      await prisma.contractSignature.deleteMany({ where: { contractId: id } })
    }

    await prisma.contract.delete({ where: { id } })
    await logAction({
      userId,
      action: "DELETE_CONTRACT",
      resource: "CONTRACT",
      resourceId: id,
      payload: { number: existing.number },
    })
    revalidatePath("/dashboard/contrats")
    return { ok: true }
  })
}

export async function compileContractContent(id: string) {
  return await withAuth(async ({ companyId }) => {
    const contract = await prisma.contract.findFirst({
      where: { id, companyId },
      include: {
        client: {
          include: { contacts: true }
        },
        company: true,
      },
    })
    if (!contract) throw new Error("Contrat introuvable")

    const primaryContact = contract.client.contacts.find((contact) => contact.isPrimary) || contract.client.contacts[0]

    return compileContractVariables({
      content: contract.content,
      client: {
        name: contract.client.name,
        email: primaryContact?.email,
      },
      company: {
        name: contract.company.name,
        siret: contract.company.siret,
      },
      contract: {
        title: contract.title,
        validFrom: contract.validFrom,
        validUntil: contract.validUntil,
      },
    })
  })
}

const publicSignatureSchema = z.object({
  signerName: z.string().trim().min(2).max(150),
  signerEmail: z.string().trim().toLowerCase().email().max(254),
  canvasData: z.string().min(100).max(1_500_000).refine(
    (value) => value.startsWith("data:image/png;base64,"),
    "Format de signature invalide",
  ),
})

function signingTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export async function getPublicContractForSigning(token: string) {
  if (token.length < 32 || token.length > 128) return null

  const signingToken = await prisma.contractSigningToken.findUnique({
    where: { tokenHash: signingTokenHash(token) },
    include: {
      contract: {
        include: {
          client: { include: { contacts: true } },
          company: true,
        },
      },
    },
  })

  if (!signingToken || signingToken.usedAt || signingToken.expiresAt <= new Date()) return null
  if (signingToken.contract.status !== "SENT") return null

  const contract = signingToken.contract
  const primaryContact = contract.client.contacts.find((contact) => contact.isPrimary) || contract.client.contacts[0]
  const compiledContent = compileContractVariables({
    content: contract.content,
    client: { name: contract.client.name, email: primaryContact?.email },
    company: { name: contract.company.name, siret: contract.company.siret },
    contract: { title: contract.title, validFrom: contract.validFrom, validUntil: contract.validUntil },
  })

  return {
    number: contract.number,
    title: contract.title,
    status: contract.status,
    content: compiledContent,
    clientName: contract.client.name,
    validFrom: contract.validFrom?.toISOString() ?? null,
    validUntil: contract.validUntil?.toISOString() ?? null,
    expectedSignerEmail: signingToken.signerEmail,
    expiresAt: signingToken.expiresAt.toISOString(),
    company: { name: contract.company.name, logo: contract.company.logo, brandColor: contract.company.brandColor },
  }
}

export async function signContractPublic(token: string, data: unknown) {
  const validated = publicSignatureSchema.parse(data)
  if (token.length < 32 || token.length > 128) throw new Error("Lien de signature invalide.")

  const headerList = await headers()
  const ipAddress = headerList.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headerList.get("x-real-ip")
    || "unknown"
  const userAgent = (headerList.get("user-agent") || "unknown").slice(0, 500)
  const tokenHash = signingTokenHash(token)
  const rateLimit = await signatureRateLimit.limit(`${tokenHash}:${ipAddress}`)
  if (!rateLimit.success) throw new Error("Trop de tentatives. Réessayez plus tard.")

  const signingToken = await prisma.contractSigningToken.findUnique({
    where: { tokenHash },
    include: { contract: { select: { id: true, content: true, status: true } } },
  })
  if (!signingToken || signingToken.usedAt || signingToken.expiresAt <= new Date()) {
    throw new Error("Ce lien de signature a expiré ou a déjà été utilisé.")
  }
  if (signingToken.contract.status !== "SENT") throw new Error("Ce contrat n'est pas disponible à la signature.")
  if (signingToken.signerEmail && signingToken.signerEmail !== validated.signerEmail) {
    throw new Error("Utilisez l'adresse e-mail à laquelle le contrat a été envoyé.")
  }

  const signedAt = new Date()
  const integrityHash = createHash("sha256").update(JSON.stringify({
    contractId: signingToken.contract.id,
    contractContentHash: createHash("sha256").update(signingToken.contract.content).digest("hex"),
    signerName: validated.signerName,
    signerEmail: validated.signerEmail,
    signedAt: signedAt.toISOString(),
    ipAddress,
    userAgent,
    signatureImageHash: createHash("sha256").update(validated.canvasData).digest("hex"),
  })).digest("hex")

  const signature = await prisma.$transaction(async (tx) => {
    const claimed = await tx.contractSigningToken.updateMany({
      where: { id: signingToken.id, usedAt: null, expiresAt: { gt: signedAt } },
      data: { usedAt: signedAt },
    })
    if (claimed.count !== 1) throw new Error("Ce lien vient d'être utilisé.")

    const created = await tx.contractSignature.create({
      data: {
        contractId: signingToken.contract.id,
        signerName: validated.signerName,
        signerEmail: validated.signerEmail,
        ipAddress,
        userAgent,
        canvasData: validated.canvasData,
        signedAt,
        integrityHash,
      },
    })
    await tx.contract.update({
      where: { id: signingToken.contract.id },
      data: { status: "SIGNED" },
    })
    return created
  })

  revalidatePath("/dashboard/contrats")
  revalidatePath(`/dashboard/contrats/${signingToken.contract.id}`)
  return { ok: true as const, signatureId: signature.id, integrityHash }
}
