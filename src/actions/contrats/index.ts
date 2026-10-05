"use server"

import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { withAuth, resolveAuthContext, AuthorizationError } from "@/lib/auth-wrapper"
import { hasPermission } from "@/lib/permissions"
import { revalidatePath } from "next/cache"
import { logAction } from "@/lib/audit"
import { ContractSchema } from "@/lib/validations"
import { buildYearlyDocumentPrefix, readCompanyDocumentNumbers, nextDocumentNumber, withDocumentNumberRetry } from "@/lib/document-numbering"
import { compileContractVariables } from "@/lib/contracts/html"
import { buildContractAmendmentContent, buildMaintenanceRenewalContent } from "@/lib/contracts/structured-documents"
import { indexedMaintenancePrice, nextMaintenanceTerm } from "@/lib/operations/maintenance-renewal"
import { signatureRateLimit } from "@/lib/rate-limit"
import { headers } from "next/headers"
import { boundedPageSize } from "@/lib/pagination"
import { prepareContractSnapshot, readContractSnapshot, sealContractSnapshot, readSignedContractDocument, contractSnapshotWhere } from "@/lib/contracts/archive"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"
import { hasExpectedSignature } from "@/lib/local-files"

type ContractInput = z.input<typeof ContractSchema>

const amendmentSchema = z.object({
  parentContractId: z.string().cuid(),
  title: z.string().trim().min(3).max(200),
  reason: z.string().trim().min(5).max(2_000),
  effectiveAt: z.string().date(),
  changes: z
    .array(
      z.object({
        category: z.enum(["PÉRIMÈTRE", "DÉLAI", "PRIX", "FACTURATION", "GARANTIE", "AUTRE"]),
        label: z.string().trim().min(2).max(150),
        previousValue: z.string().trim().max(1_000).optional().or(z.literal("")),
        nextValue: z.string().trim().min(1).max(1_000),
        financialImpactCents: z.number().int().min(-100_000_000).max(100_000_000).nullable().optional(),
      }),
    )
    .min(1)
    .max(20),
})

export async function getContracts(cursor?: string, limit = 50) {
  return await withAuth(async ({ companyId }) => {
    const pageSize = boundedPageSize(limit, 50, 100)
    return await prisma.contract.findMany({
      where: { companyId },
      take: pageSize,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      select: {
        id: true, number: true, title: true, status: true, kind: true, validUntil: true, createdAt: true,
        client: { select: { id: true, name: true } },
        signatures: { select: { id: true, signerName: true, signedAt: true } },
      },
      orderBy: { createdAt: "desc" },
    })
  }, "sales.read")
}

export async function getContractById(id: string) {
  return await withAuth(async ({ companyId }) => {
    return await prisma.contract.findFirst({
      where: { id, companyId },
      include: {
        client: true,
        company: true,
        signatures: true,
        changes: { orderBy: { order: "asc" } },
        parentContract: { select: { id: true, number: true, title: true, status: true } },
        amendments: { select: { id: true, number: true, title: true, status: true, effectiveAt: true }, orderBy: { createdAt: "desc" } },
        maintenanceContract: { select: { id: true, number: true, label: true, renewalStatus: true } },
      },
    })
  }, "sales.read")
}

async function generateContractNumber(companyId: string, documentPrefix = "CONT-") {
  const prefix = buildYearlyDocumentPrefix(documentPrefix, documentPrefix)
  const last = await readCompanyDocumentNumbers(() => prisma.contract.findMany({
    where: { companyId, number: { startsWith: prefix } },
    select: { number: true },
  }))
  return nextDocumentNumber(last, prefix)
}

export async function createContractAmendment(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = amendmentSchema.parse(input)
    const parent = await prisma.contract.findFirst({
      where: { id: data.parentContractId, companyId },
      select: { id: true, number: true, clientId: true, status: true, kind: true },
    })
    if (!parent) throw new Error("Contrat source introuvable")
    if (parent.status !== "SIGNED") throw new Error("Seul un contrat signé peut recevoir un avenant")
    if (parent.kind === "MAINTENANCE_RENEWAL") throw new Error("Créez l’avenant depuis le contrat principal")

    const effectiveAt = new Date(`${data.effectiveAt}T12:00:00.000Z`)
    const content = buildContractAmendmentContent({
      sourceNumber: parent.number,
      reason: data.reason,
      effectiveAt,
      changes: data.changes,
    })
    const contract = await withDocumentNumberRetry(
      async () => {
        const number = await generateContractNumber(companyId, "AVN-")
        return prisma.contract.create({
          data: {
            companyId,
            clientId: parent.clientId,
            number,
            title: data.title,
            status: "DRAFT",
            kind: "AMENDMENT",
            content,
            validFrom: effectiveAt,
            parentContractId: parent.id,
            amendmentReason: data.reason,
            effectiveAt,
            changes: {
              create: data.changes.map((change, order) => ({ ...change, previousValue: change.previousValue || null, order })),
            },
          },
        })
      },
      { label: "l’avenant" },
    )

    await logAction({
      userId,
      action: "CREATE_CONTRACT_AMENDMENT",
      resource: "CONTRACT",
      resourceId: contract.id,
      payload: { number: contract.number, parentContractId: parent.id, parentNumber: parent.number, changeCount: data.changes.length },
    })
    revalidatePath("/dashboard/contrats")
    revalidatePath(`/dashboard/contrats/${parent.id}`)
    return contract
  })
}

export async function createMaintenanceRenewalProposal(maintenanceContractId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = z.string().cuid().parse(maintenanceContractId)
    const maintenance = await prisma.maintenanceContract.findFirst({
      where: { id: parsedId, companyId },
      include: {
        site: { select: { label: true } },
        renewalProposals: {
          where: { status: { in: ["DRAFT", "SENT", "SIGNED"] } },
          select: { id: true, number: true, status: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: { select: { renewedContracts: true } },
      },
    })
    if (!maintenance) throw new Error("Contrat d’entretien introuvable")
    if (!maintenance.endDate) throw new Error("Renseignez une date de fin avant de préparer la proposition")
    if (maintenance.renewalStatus === "DECLINED") throw new Error("Le renouvellement a été refusé")
    if (maintenance.renewalStatus === "RENEWED" || maintenance._count.renewedContracts > 0) throw new Error("Ce terme a déjà été renouvelé")
    if (maintenance.renewalProposals[0]) return maintenance.renewalProposals[0]

    const term = nextMaintenanceTerm(maintenance.startDate, maintenance.endDate)
    const nextPriceCents = indexedMaintenancePrice(maintenance.priceCents, maintenance.indexationRate)
    const content = buildMaintenanceRenewalContent({
      sourceNumber: maintenance.number,
      label: maintenance.label,
      siteLabel: maintenance.site.label,
      nextStartDate: term.startDate,
      nextEndDate: term.endDate,
      currentPriceCents: maintenance.priceCents,
      nextPriceCents,
      indexationRate: maintenance.indexationRate,
      frequency: maintenance.frequency,
      noticeDays: maintenance.noticeDays,
    })
    const result = await withDocumentNumberRetry(
      async () =>
        prisma.$transaction(
          async (tx) => {
            // Lock the maintenance row so concurrent clicks reuse the same active proposal.
            await tx.maintenanceContract.update({ where: { id: maintenance.id }, data: { updatedAt: new Date() } })
            const activeProposal = await tx.contract.findFirst({
              where: {
                maintenanceContractId: maintenance.id,
                status: { in: ["DRAFT", "SENT", "SIGNED"] },
              },
              select: { id: true, number: true, status: true },
              orderBy: { createdAt: "desc" },
            })
            if (activeProposal) return { contract: activeProposal, created: false as const }

            const prefix = buildYearlyDocumentPrefix("REN-", "REN-")
            const last = await readCompanyDocumentNumbers(() => tx.contract.findMany({
              where: { companyId, number: { startsWith: prefix } },
              select: { number: true },
            }))
            const contract = await tx.contract.create({
              data: {
                companyId,
                clientId: maintenance.clientId,
                maintenanceContractId: maintenance.id,
                number: nextDocumentNumber(last, prefix),
                title: `Renouvellement · ${maintenance.label}`,
                status: "DRAFT",
                kind: "MAINTENANCE_RENEWAL",
                content,
                validFrom: term.startDate,
                validUntil: term.endDate,
              },
              select: { id: true, number: true, status: true },
            })
            return { contract, created: true as const }
          },
          { isolationLevel: "Serializable" },
        ),
      { label: "la proposition de renouvellement" },
    )
    const contract = result.contract

    if (result.created) {
      await logAction({
        userId,
        action: "CREATE_MAINTENANCE_RENEWAL_PROPOSAL",
        resource: "CONTRACT",
        resourceId: contract.id,
        payload: { number: contract.number, maintenanceContractId: maintenance.id, maintenanceNumber: maintenance.number, nextPriceCents },
      })
    }
    revalidatePath("/dashboard/contrats")
    revalidatePath("/dashboard/operations")
    return contract
  })
}

export async function createContract(data: ContractInput) {
  return await withAuth(async ({ companyId, userId }) => {
    const validated = ContractSchema.parse(data)
    const client = await prisma.client.findFirst({ where: { id: validated.clientId, companyId }, select: { id: true } })
    if (!client) throw new Error("Client introuvable")
    const contract = await withDocumentNumberRetry(
      async () => {
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
      },
      { label: "le contrat" },
    )
    revalidatePath("/dashboard/contrats")
    return contract
  })
}

export async function updateContract(id: string, data: ContractInput) {
  return await withAuth(async ({ companyId, userId }) => {
    const validated = ContractSchema.parse(data)
    const existing = await prisma.contract.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Contrat introuvable")
    if (existing.kind !== "STANDARD") throw new Error("Ce document structuré doit être recréé pour conserver une piste d’audit cohérente.")
    if (existing.status === "SIGNED") throw new Error("Un contrat signé ne peut pas être modifié.")
    const client = await prisma.client.findFirst({ where: { id: validated.clientId, companyId }, select: { id: true } })
    if (!client) throw new Error("Client introuvable")

    const contract = await prisma.$transaction(async (tx) => {
      const claimed = await tx.contract.updateMany({
        where: { id, companyId, status: existing.status, updatedAt: existing.updatedAt },
        data: {
          clientId: validated.clientId,
          title: validated.title,
          content: validated.content,
          validFrom: validated.validFrom ? new Date(validated.validFrom) : null,
          validUntil: validated.validUntil ? new Date(validated.validUntil) : null,
        },
      })
      if (claimed.count !== 1) throw new Error("Le contrat a changé pendant la modification. Rechargez-le puis réessayez.")
      return tx.contract.findUniqueOrThrow({ where: { id } })
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

export async function updateContractStatus(contractId: string, status: "DRAFT" | "SENT" | "SIGNED" | "EXPIRED") {
  return await withAuth(async ({ userId, companyId }) => {
    assertDemoMutationAllowed()
    const existing = await prisma.contract.findFirst({
      where: { id: contractId, companyId },
      include: {
        client: { include: { contacts: { orderBy: [{ isPrimary: "desc" }, { id: "asc" }] } } },
        company: true,
        maintenanceContract: { select: { id: true, renewalStatus: true } },
        _count: { select: { signatures: true } },
      },
    })
    if (!existing) throw new Error("Contrat introuvable")
    if (existing.status === "SIGNED") throw new Error("Un contrat signé est immuable")
    if (status === "SIGNED") throw new Error("Utilisez le lien de signature électronique pour signer ce document")
    const allowedTransitions: Record<string, string[]> = {
      DRAFT: ["SENT"],
      // Re-sending invalidates the previous token and creates a new one.
      SENT: ["SENT", "EXPIRED"],
      EXPIRED: [],
      SIGNED: [],
    }
    if (!allowedTransitions[existing.status]?.includes(status)) throw new Error("Transition de statut non autorisée")
    if (status === "SENT" && existing.maintenanceContract?.renewalStatus === "RENEWED") {
      throw new Error("Ce contrat d’entretien a déjà été renouvelé")
    }

    let signingPath: string | null = null
    const captured = status === "SENT" ? await prepareContractSnapshot(existing) : null
    const fresh = await resolveAuthContext()
    if (!fresh || fresh.userId !== userId || fresh.companyId !== companyId || !hasPermission(fresh.role, "sales.write")) throw new AuthorizationError()
    const sentRevision = new Date()
    const contract = await prisma.$transaction(async (tx) => {
      const claimed = await tx.contract.updateMany({
        where: { id: contractId, companyId, status: existing.status, updatedAt: existing.updatedAt, ...(captured ? contractSnapshotWhere(captured.snapshot) : {}) },
        data: { status, updatedAt: sentRevision },
      })
      if (claimed.count !== 1) throw new Error("Le contrat a changé. Rechargez-le puis réessayez.")

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
            documentSnapshot: captured!.documentSnapshot,
            documentHash: captured!.documentHash,
            contractRevision: sentRevision,
            expiresAt,
          },
        })
        signingPath = `/sign/contracts/${token}`
        if (existing.maintenanceContractId) {
          await tx.maintenanceContract.update({
            where: { id: existing.maintenanceContractId },
            data: { renewalStatus: "PROPOSED" },
          })
        }
      } else {
        await tx.contractSigningToken.deleteMany({ where: { contractId, usedAt: null } })
      }

      return tx.contract.findUniqueOrThrow({ where: { id: contractId } })
    })
    await logAction({
      userId,
      action: "UPDATE_CONTRACT_STATUS",
      resource: "CONTRACT",
      resourceId: contractId,
      payload: { status },
    })
    revalidatePath("/dashboard/contrats")
    revalidatePath(`/dashboard/contrats/${contractId}`)
    // The path is assigned by the transaction callback.
    return { ...contract, signingPath: signingPath as string | null }
  })
}

export async function deleteContract(id: string) {
  return await withAuth(async ({ companyId, userId }) => {
    const existing = await prisma.contract.findFirst({
      where: { id, companyId },
      include: { _count: { select: { signatures: true, amendments: true } } },
    })
    if (!existing) throw new Error("Contrat introuvable")
    if (existing.status === "SIGNED") throw new Error("Un contrat signé ne peut pas être supprimé.")
    if (existing._count.amendments > 0) throw new Error("Ce contrat possède des avenants et doit être conservé.")

    await prisma.$transaction(async (tx) => {
      // ContractSignature relation has no onDelete:Cascade — clear them first.
      if (existing._count.signatures > 0) {
        await tx.contractSignature.deleteMany({ where: { contractId: id } })
      }
      await tx.contract.delete({ where: { id } })
      if (existing.maintenanceContractId) {
        await tx.maintenanceContract.updateMany({
          where: { id: existing.maintenanceContractId, companyId, renewalStatus: "PROPOSED" },
          data: { renewalStatus: "UPCOMING" },
        })
      }
    })
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
          include: { contacts: true },
        },
        company: true,
      },
    })
    if (!contract) throw new Error("Contrat introuvable")

    if (contract.status === "SIGNED") return readSignedContractDocument(contract.signedDocument, contract).content
    if (contract.status === "SENT") {
      const link = await prisma.contractSigningToken.findFirst({ where: { contractId: id, usedAt: null, expiresAt: { gt: new Date() }, contractRevision: contract.updatedAt }, orderBy: { createdAt: "desc" } })
      if (link?.documentSnapshot && link.documentHash) return readContractSnapshot(link.documentSnapshot, link.documentHash, contract).content
    }
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
  documentHash: z.string().regex(/^[a-f0-9]{64}$/),
  signerName: z.string().trim().min(2).max(150),
  signerEmail: z.string().trim().toLowerCase().email().max(254),
  canvasData: z
    .string()
    .min(100)
    .max(1_500_000)
    .refine((value) => {
      if (!/^data:image\/png;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false
      const bytes = Buffer.from(value.slice("data:image/png;base64,".length), "base64")
      if (bytes.length < 24 || !hasExpectedSignature("image/png", bytes) || bytes.subarray(12, 16).toString() !== "IHDR") return false
      const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
      return width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 4_000_000
    }, "Format de signature invalide"),
})

function signingTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export async function getPublicContractForSigning(token: string) {
  if (token.length < 32 || token.length > 128) return null

  const signingToken = await prisma.contractSigningToken.findUnique({
    where: { tokenHash: signingTokenHash(token) },
    include: { contract: true },
  })

  if (!signingToken || signingToken.expiresAt <= new Date()) return null
  if (signingToken.usedAt && signingToken.contract.status !== "SIGNED") return null
  if (!signingToken.usedAt && signingToken.contract.status !== "SENT") return null

  const contract = signingToken.contract
  if (!signingToken.usedAt && signingToken.contractRevision?.getTime() !== contract.updatedAt.getTime()) return null
  if (!signingToken.documentSnapshot || !signingToken.documentHash) return null
  const snapshot = readContractSnapshot(signingToken.documentSnapshot, signingToken.documentHash, contract)
  if (!signingToken.usedAt && !await prisma.contract.count({ where: { ...contractSnapshotWhere(snapshot), status: "SENT", updatedAt: signingToken.contractRevision! } })) return null

  return {
    number: snapshot.number,
    title: snapshot.title,
    status: contract.status,
    content: snapshot.content,
    clientName: snapshot.clientName,
    validFrom: snapshot.validFrom,
    validUntil: snapshot.validUntil,
    documentHash: signingToken.documentHash,
    expectedSignerEmail: signingToken.signerEmail,
    expiresAt: signingToken.expiresAt.toISOString(),
    company: snapshot.company,
  }
}

class ContractSignatureError extends Error {}

export async function signContractPublic(token: string, data: unknown) {
  assertDemoMutationAllowed()
  const parsed = publicSignatureSchema.safeParse(data)
  if (!parsed.success) return { ok: false as const, error: "Nom, adresse e-mail, empreinte ou format de signature invalide" }
  try {
    return await commitContractSignature(token, parsed.data)
  } catch (error) {
    // Expected refusals must remain readable in a production Server Action response.
    if (error instanceof ContractSignatureError) return { ok: false as const, error: error.message }
    throw error
  }
}

async function commitContractSignature(token: string, validated: z.infer<typeof publicSignatureSchema>) {
  if (token.length < 32 || token.length > 128) throw new ContractSignatureError("Lien de signature invalide.")

  const headerList = await headers()
  const ipAddress = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown"
  const userAgent = (headerList.get("user-agent") || "unknown").slice(0, 500)
  const tokenHash = signingTokenHash(token)
  const rateLimit = await signatureRateLimit.limit(`${tokenHash}:${ipAddress}`)
  if (!rateLimit.success) throw new ContractSignatureError("Trop de tentatives. Réessayez plus tard.")

  const signingToken = await prisma.contractSigningToken.findUnique({
    where: { tokenHash },
    include: { contract: { select: { id: true, companyId: true, clientId: true, updatedAt: true, status: true, kind: true, maintenanceContractId: true } } },
  })
  if (!signingToken || signingToken.usedAt || signingToken.expiresAt <= new Date()) {
    throw new ContractSignatureError("Ce lien de signature a expiré ou a déjà été utilisé.")
  }
  if (signingToken.contract.status !== "SENT") throw new ContractSignatureError("Ce contrat n'est pas disponible à la signature.")
  if (signingToken.contractRevision?.getTime() !== signingToken.contract.updatedAt.getTime() || signingToken.documentHash !== validated.documentHash) throw new ContractSignatureError("Le contrat présenté a changé ; demandez un nouveau lien de signature")
  let snapshot: ReturnType<typeof readContractSnapshot>
  try { snapshot = readContractSnapshot(signingToken.documentSnapshot, signingToken.documentHash, signingToken.contract) }
  catch { throw new ContractSignatureError("Capture du contrat indisponible ; demandez un nouveau lien de signature") }
  if (signingToken.signerEmail && signingToken.signerEmail !== validated.signerEmail) {
    throw new ContractSignatureError("Utilisez l'adresse e-mail à laquelle le contrat a été envoyé.")
  }

  const signedAt = new Date()
  const signedDocument = sealContractSnapshot(snapshot, validated.documentHash, { ...validated, signedAt })
  const integrityHash = createHash("sha256")
    .update(
      JSON.stringify({
        contractId: signingToken.contract.id,
        integrityVersion: 2,
        documentHash: validated.documentHash,
        signerName: validated.signerName,
        signerEmail: validated.signerEmail,
        signedAt: signedAt.toISOString(),
        ipAddress,
        userAgent,
        signatureImageHash: createHash("sha256").update(validated.canvasData).digest("hex"),
      }),
    )
    .digest("hex")

  const signature = await prisma.$transaction(async (tx) => {
    const contractClaim = await tx.contract.updateMany({ where: { ...contractSnapshotWhere(snapshot), status: "SENT", updatedAt: signingToken.contractRevision! }, data: { status: "SIGNED", signedDocument, archiveStatus: "PENDING", archiveAttempts: 0, archiveNextAttemptAt: signedAt, archiveError: null } })
    if (contractClaim.count !== 1) throw new ContractSignatureError("Le contrat a changé ; demandez un nouveau lien de signature")
    const claimed = await tx.contractSigningToken.updateMany({
      where: { id: signingToken.id, usedAt: null, expiresAt: { gt: signedAt } },
      data: { usedAt: signedAt },
    })
    if (claimed.count !== 1) throw new ContractSignatureError("Ce lien vient d'être utilisé.")

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
    if (signingToken.contract.kind === "MAINTENANCE_RENEWAL" && signingToken.contract.maintenanceContractId) {
      const accepted = await tx.maintenanceContract.updateMany({
        where: { id: signingToken.contract.maintenanceContractId, renewalStatus: { not: "RENEWED" } },
        data: { renewalStatus: "ACCEPTED" },
      })
      if (accepted.count !== 1) throw new ContractSignatureError("Ce contrat d’entretien a déjà été renouvelé")
    }
    return created
  })

  revalidatePath("/dashboard/contrats")
  revalidatePath(`/dashboard/contrats/${signingToken.contract.id}`)
  return { ok: true as const, signatureId: signature.id, integrityHash, signedAt: signedAt.toISOString(), archiveStatus: "PENDING" as const }
}
