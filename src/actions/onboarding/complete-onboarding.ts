"use server"

import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { OnboardingFormSchema } from "@/lib/validations"
import { Prisma } from "@prisma/client"
import { redirect } from "next/navigation"
import { encrypt } from "@/lib/crypto"

function parseLatePenaltyRate(value: string) {
  return value === "" ? 12.25 : Number(value.replace(",", "."))
}

export async function completeOnboarding(data: unknown) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return { success: false, error: "Vous devez être connecté." }
    }

    const userId = session.user.id

    // Validate and sanitize input
    const validated = OnboardingFormSchema.safeParse(data)
    if (!validated.success) {
      const firstError = validated.error.issues[0]
      return { success: false, error: firstError?.message ?? "Données invalides." }
    }

    const payload = validated.data
    const latePenaltyRate = parseLatePenaltyRate(payload.latePenaltyRate)

    // Check if user already has a company to avoid duplicate onboarding
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    })

    if (!currentUser?.companyId) {
      await prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            name: payload.companyName,
            fullName: payload.fullName,
            siret: payload.siret || null,
            address: payload.address,
            email: payload.email,
            phone: payload.phone || null,
            isTvaApplicable: payload.isTvaApplicable,
            tvaNumber: payload.isTvaApplicable ? payload.tvaNumber || null : null,
            apeCode: payload.apeCode || null,
            iban: payload.iban ? encrypt(payload.iban) : null,
            invoicePrefix: payload.invoicePrefix,
            paymentTerms: payload.paymentTerms,
            latePenaltyRate,
            pdfTemplate: payload.pdfTemplate,
          },
        })

        await tx.user.upsert({
          where: { id: userId },
          update: { companyId: company.id },
          create: {
            id: userId,
            email: session.user?.email || "unknown@user.com",
            name: session.user?.name || "Guest",
            companyId: company.id,
            emailVerified: new Date(),
          },
        })

        const membership = await tx.membership.create({
          data: {
            companyId: company.id,
            userId,
            role: "OWNER",
            status: "ACTIVE",
          },
        })

        await tx.saasSubscription.create({
          data: { companyId: company.id, plan: "ALPHA", status: "ACTIVE", seatQuantity: 1 },
        })

        const agency = await tx.agency.create({
          data: {
            companyId: company.id,
            code: "PRINCIPALE",
            name: "Agence principale",
            kind: "MIXED",
            address: payload.address,
            phone: payload.phone || null,
            email: payload.email,
            isDefault: true,
          },
        })

        await tx.agencyMembership.create({
          data: { agencyId: agency.id, membershipId: membership.id, isPrimary: true },
        })

        if (payload.firstClientName) {
          await tx.client.create({
            data: {
              companyId: company.id,
              name: payload.firstClientName,
            },
          })
        }

        await tx.pipeline.create({
          data: {
            companyId: company.id,
            stages: [
              { id: "prospect", title: "Prospect" },
              { id: "contact", title: "Contact" },
              { id: "sent", title: "Devis envoyé" },
              { id: "won", title: "Gagné" },
              { id: "lost", title: "Perdu" },
            ],
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: "UPDATE_SETTINGS",
            resource: "COMPANY",
            resourceId: company.id,
            payload: { onboarding: "COMPLETED" },
          },
        })
      }, { timeout: 20000 })
    }

    redirect("/dashboard")
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof error.digest === "string" &&
      error.digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        success: false,
        error: "Ce SIRET est déjà associé à un espace entreprise.",
      }
    }
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Une erreur fatale est survenue lors de la création de votre espace.",
    }
  }
}
