"use server"

import { auth } from "@/auth"
import { withAuth } from "@/lib/auth-wrapper"
import {
  canAssignRole,
  COMPANY_ROLES,
  normalizeCompanyRole,
  type CompanyRole,
} from "@/lib/permissions"
import prisma from "@/lib/prisma"
import { createInvitationToken, hashInvitationToken } from "@/lib/team-invitations"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

const emailSchema = z.string().trim().toLowerCase().email().max(254)
const roleSchema = z.enum(COMPANY_ROLES)
const memberIdSchema = z.string().cuid()
const invitationTokenSchema = z.string().min(32).max(128)

export async function getTeamOverview() {
  return withAuth(async ({ companyId, role }) => {
    const [members, invitations] = await Promise.all([
      prisma.membership.findMany({
        where: { companyId },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      }),
      prisma.companyInvitation.findMany({
        where: { companyId, acceptedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ])

    return {
      actorRole: role,
      members: members.map((member) => ({
        id: member.id,
        role: normalizeCompanyRole(member.role),
        status: member.status,
        title: member.title,
        weeklyCapacityMinutes: member.weeklyCapacityMinutes,
        hourlyCostCents: member.hourlyCostCents,
        createdAt: member.createdAt.toISOString(),
        user: member.user,
      })),
      invitations: invitations.map((invitation) => ({
        ...invitation,
        role: normalizeCompanyRole(invitation.role),
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
      })),
    }
  }, "members.manage")
}

export async function createTeamInvitation(data: unknown) {
  return withAuth(async ({ companyId, userId, role: actorRole }) => {
    const parsed = z.object({ email: emailSchema, role: roleSchema }).safeParse(data)
    if (!parsed.success) {
      return { success: false as const, error: "Adresse e-mail ou rôle invalide." }
    }

    if (!canAssignRole(actorRole, parsed.data.role)) {
      return { success: false as const, error: "Vous ne pouvez pas attribuer ce rôle." }
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, memberships: { where: { companyId }, select: { id: true, status: true } } },
    })
    if (existingUser?.memberships.some((membership) => membership.status === "ACTIVE")) {
      return { success: false as const, error: "Cette personne fait déjà partie de l'équipe." }
    }

    const token = createInvitationToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await prisma.$transaction(async (tx) => {
      await tx.companyInvitation.deleteMany({
        where: { companyId, email: parsed.data.email, acceptedAt: null },
      })
      await tx.companyInvitation.create({
        data: {
          companyId,
          email: parsed.data.email,
          role: parsed.data.role,
          tokenHash: hashInvitationToken(token),
          expiresAt,
          invitedById: userId,
        },
      })
    })

    revalidatePath("/dashboard/equipe")
    return {
      success: true as const,
      invitationPath: `/join/${token}`,
      expiresAt: expiresAt.toISOString(),
    }
  }, "members.manage")
}

export async function cancelTeamInvitation(invitationId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = memberIdSchema.safeParse(invitationId)
    if (!parsedId.success) return { success: false as const, error: "Invitation invalide." }

    const result = await prisma.companyInvitation.deleteMany({
      where: { id: parsedId.data, companyId, acceptedAt: null },
    })
    revalidatePath("/dashboard/equipe")
    return result.count === 1
      ? { success: true as const }
      : { success: false as const, error: "Invitation introuvable." }
  }, "members.manage")
}

export async function updateTeamMemberRole(memberId: string, nextRole: CompanyRole) {
  return withAuth(async ({ companyId, membershipId, role: actorRole }) => {
    const parsed = z.object({ memberId: memberIdSchema, nextRole: roleSchema }).safeParse({ memberId, nextRole })
    if (!parsed.success) return { success: false as const, error: "Membre ou rôle invalide." }

    const member = await prisma.membership.findFirst({
      where: { id: parsed.data.memberId, companyId },
      select: { id: true, role: true },
    })
    if (!member) return { success: false as const, error: "Membre introuvable." }

    const currentRole = normalizeCompanyRole(member.role)
    if (!canAssignRole(actorRole, currentRole) || !canAssignRole(actorRole, parsed.data.nextRole)) {
      return { success: false as const, error: "Vous ne pouvez pas modifier ce rôle." }
    }

    if (member.id === membershipId && currentRole === "OWNER" && parsed.data.nextRole !== "OWNER") {
      const otherOwners = await prisma.membership.count({
        where: { companyId, role: "OWNER", status: "ACTIVE", id: { not: member.id } },
      })
      if (otherOwners === 0) {
        return { success: false as const, error: "Nommez un autre propriétaire avant de modifier votre rôle." }
      }
    }

    await prisma.membership.update({ where: { id: member.id }, data: { role: parsed.data.nextRole } })
    revalidatePath("/dashboard/equipe")
    return { success: true as const }
  }, "members.manage")
}

export async function updateTeamMemberWorkSettings(memberId: string, weeklyHours: number, hourlyCostCents: number) {
  return withAuth(async ({ companyId, role: actorRole }) => {
    const parsed = z.object({ memberId: memberIdSchema, weeklyHours: z.coerce.number().min(1).max(168), hourlyCostCents: z.coerce.number().int().min(0).max(1_000_000) }).safeParse({ memberId, weeklyHours, hourlyCostCents })
    if (!parsed.success) return { success: false as const, error: "Capacité ou coût horaire invalide." }
    const member = await prisma.membership.findFirst({ where: { id: parsed.data.memberId, companyId }, select: { id: true, role: true } })
    if (!member) return { success: false as const, error: "Membre introuvable." }
    if (!canAssignRole(actorRole, normalizeCompanyRole(member.role))) return { success: false as const, error: "Vous ne pouvez pas modifier ces paramètres." }
    await prisma.membership.update({ where: { id: member.id }, data: { weeklyCapacityMinutes: Math.round(parsed.data.weeklyHours * 60), hourlyCostCents: parsed.data.hourlyCostCents } })
    revalidatePath("/dashboard/equipe")
    revalidatePath("/dashboard/operations")
    return { success: true as const }
  }, "members.manage")
}

export async function deactivateTeamMember(memberId: string) {
  return withAuth(async ({ companyId, membershipId, role: actorRole }) => {
    const parsedId = memberIdSchema.safeParse(memberId)
    if (!parsedId.success) return { success: false as const, error: "Membre invalide." }
    if (parsedId.data === membershipId) {
      return { success: false as const, error: "Vous ne pouvez pas désactiver votre propre accès." }
    }

    const member = await prisma.membership.findFirst({
      where: { id: parsedId.data, companyId },
      select: { id: true, role: true },
    })
    if (!member) return { success: false as const, error: "Membre introuvable." }

    const memberRole = normalizeCompanyRole(member.role)
    if (!canAssignRole(actorRole, memberRole)) {
      return { success: false as const, error: "Vous ne pouvez pas désactiver ce membre." }
    }

    if (memberRole === "OWNER") {
      const ownerCount = await prisma.membership.count({
        where: { companyId, role: "OWNER", status: "ACTIVE" },
      })
      if (ownerCount <= 1) {
        return { success: false as const, error: "Le dernier propriétaire ne peut pas être désactivé." }
      }
    }

    await prisma.membership.update({ where: { id: member.id }, data: { status: "INACTIVE" } })
    revalidatePath("/dashboard/equipe")
    return { success: true as const }
  }, "members.manage")
}

export async function getInvitationPreview(token: string) {
  const parsed = invitationTokenSchema.safeParse(token)
  if (!parsed.success) return null

  const invitation = await prisma.companyInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(parsed.data) },
    select: {
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      company: { select: { name: true, logo: true, brandColor: true } },
    },
  })

  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) return null
  return {
    email: invitation.email,
    role: normalizeCompanyRole(invitation.role),
    companyName: invitation.company.name,
    companyLogo: invitation.company.logo,
    companyBrandColor: invitation.company.brandColor,
    expiresAt: invitation.expiresAt.toISOString(),
  }
}

export async function acceptTeamInvitation(token: string) {
  const parsed = invitationTokenSchema.safeParse(token)
  if (!parsed.success) return { success: false as const, error: "Invitation invalide." }

  const session = await auth()
  if (!session?.user?.id || !session.user.email) {
    return { success: false as const, error: "Authentification requise." }
  }

  const tokenHash = hashInvitationToken(parsed.data)
  const invitation = await prisma.companyInvitation.findUnique({
    where: { tokenHash },
    select: { id: true, companyId: true, email: true, role: true, expiresAt: true, acceptedAt: true },
  })

  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
    return { success: false as const, error: "Cette invitation a expiré ou a déjà été utilisée." }
  }
  if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
    return { success: false as const, error: `Connectez-vous avec ${invitation.email}.` }
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.companyInvitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() },
    })
    if (claimed.count !== 1) throw new Error("Invitation déjà utilisée")

    await tx.membership.upsert({
      where: { companyId_userId: { companyId: invitation.companyId, userId: session.user!.id! } },
      update: { role: invitation.role, status: "ACTIVE" },
      create: {
        companyId: invitation.companyId,
        userId: session.user!.id!,
        role: invitation.role,
        status: "ACTIVE",
      },
    })
    await tx.user.update({
      where: { id: session.user!.id! },
      data: { companyId: invitation.companyId },
    })
  })

  redirect("/dashboard")
}
