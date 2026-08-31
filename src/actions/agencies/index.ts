"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { logAction } from "@/lib/audit"
import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"
import { assertWithinPlanLimit } from "@/lib/billing/subscription"

const agencyIdSchema = z.string().cuid()
const agencySchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(30).transform((value) => value.toUpperCase()),
  kind: z.enum(["STORE", "INSTALLATION", "SERVICE", "MIXED"]),
  address: z.string().trim().max(200).optional().transform((value) => value || null),
  postalCode: z.string().trim().max(20).optional().transform((value) => value || null),
  city: z.string().trim().max(100).optional().transform((value) => value || null),
  phone: z.string().trim().max(40).optional().transform((value) => value || null),
  email: z.union([z.string().trim().email(), z.literal("")]).optional().transform((value) => value || null),
  active: z.boolean().default(true),
  isDefault: z.boolean().default(false),
}).refine((agency) => !agency.isDefault || agency.active, {
  message: "L’agence principale doit rester active",
  path: ["active"],
})

const assignmentSchema = z.object({
  agencyId: agencyIdSchema,
  membershipIds: z.array(z.string().cuid()).max(500),
  warehouseIds: z.array(z.string().cuid()).max(500),
})

function revalidateAgencyManagement() {
  revalidatePath("/dashboard/settings")
  revalidatePath("/dashboard/settings/agencies")
  revalidatePath("/dashboard/operations")
  revalidatePath("/dashboard/equipe")
}

export async function getActiveAgencies() {
  return withAuth(({ companyId }) => prisma.agency.findMany({
    where: { companyId, active: true },
    select: { id: true, code: true, name: true, kind: true, isDefault: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  }), "operations.read")
}

export async function getAgencyManagement() {
  return withAuth(async ({ companyId }) => {
    const [agencies, memberships, warehouses] = await Promise.all([
      prisma.agency.findMany({
        where: { companyId },
        include: {
          memberships: {
            include: {
              membership: {
                select: {
                  id: true,
                  role: true,
                  status: true,
                  user: { select: { name: true, email: true } },
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          warehouses: { select: { id: true, name: true, code: true, active: true }, orderBy: { name: "asc" } },
          _count: { select: { customerSites: true, projects: true } },
        },
        orderBy: [{ isDefault: "desc" }, { active: "desc" }, { name: "asc" }],
      }),
      prisma.membership.findMany({
        where: { companyId, status: "ACTIVE" },
        select: { id: true, role: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.warehouse.findMany({
        where: { companyId },
        select: { id: true, name: true, code: true, agencyId: true, active: true },
        orderBy: [{ active: "desc" }, { name: "asc" }],
      }),
    ])
    return { agencies, memberships, warehouses }
  }, "company.manage")
}

export async function createAgency(input: unknown) {
  return withAuth(async ({ companyId, membershipId, userId }) => {
    const data = agencySchema.parse(input)
    const existingCount = await prisma.agency.count({ where: { companyId } })
    if (data.active) {
      const activeCount = await prisma.agency.count({ where: { companyId, active: true } })
      await assertWithinPlanLimit(companyId, "agencies", activeCount)
    }
    const makeDefault = existingCount === 0 || data.isDefault
    const agency = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.agency.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } })
        await tx.agencyMembership.updateMany({
          where: { membership: { companyId }, isPrimary: true },
          data: { isPrimary: false },
        })
      }
      const created = await tx.agency.create({
        data: {
          companyId,
          ...data,
          isDefault: makeDefault,
          memberships: { create: { membershipId, isPrimary: makeDefault } },
        },
      })
      return created
    })
    await logAction({
      userId,
      action: "CREATE_AGENCY",
      resource: "AGENCY",
      resourceId: agency.id,
      payload: { code: agency.code, kind: agency.kind, isDefault: agency.isDefault },
    })
    revalidateAgencyManagement()
    return { success: true as const, id: agency.id }
  }, "company.manage")
}

export async function updateAgency(agencyId: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const id = agencyIdSchema.parse(agencyId)
    const data = agencySchema.parse(input)
    const existing = await prisma.agency.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Agence introuvable")
    if (existing.isDefault && !data.active) throw new Error("L’agence principale doit rester active")
    if (!existing.active && data.active) {
      const activeCount = await prisma.agency.count({ where: { companyId, active: true } })
      await assertWithinPlanLimit(companyId, "agencies", activeCount)
    }

    const agency = await prisma.$transaction(async (tx) => {
      if (data.isDefault && !existing.isDefault) {
        await tx.agency.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } })
        await tx.agencyMembership.updateMany({
          where: { membership: { companyId }, isPrimary: true },
          data: { isPrimary: false },
        })
        await tx.agencyMembership.updateMany({ where: { agencyId: id }, data: { isPrimary: true } })
      }
      return tx.agency.update({
        where: { id },
        data: { ...data, isDefault: existing.isDefault || data.isDefault },
      })
    })
    await logAction({
      userId,
      action: "UPDATE_AGENCY",
      resource: "AGENCY",
      resourceId: agency.id,
      payload: { code: agency.code, active: agency.active, isDefault: agency.isDefault },
    })
    revalidateAgencyManagement()
    return { success: true as const }
  }, "company.manage")
}

export async function updateAgencyAssignments(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = assignmentSchema.parse(input)
    const [agency, memberships, warehouses] = await Promise.all([
      prisma.agency.findFirst({ where: { id: data.agencyId, companyId }, select: { id: true, isDefault: true } }),
      prisma.membership.findMany({ where: { companyId, id: { in: data.membershipIds }, status: "ACTIVE" }, select: { id: true } }),
      prisma.warehouse.findMany({ where: { companyId, id: { in: data.warehouseIds } }, select: { id: true } }),
    ])
    if (!agency) throw new Error("Agence introuvable")
    if (memberships.length !== new Set(data.membershipIds).size) throw new Error("Un membre sélectionné est invalide")
    if (warehouses.length !== new Set(data.warehouseIds).size) throw new Error("Un dépôt sélectionné est invalide")
    if (data.membershipIds.length === 0) throw new Error("Affectez au moins un membre à l’agence")

    await prisma.$transaction(async (tx) => {
      await tx.agencyMembership.deleteMany({
        where: { agencyId: agency.id, membershipId: { notIn: data.membershipIds } },
      })
      for (const membershipId of data.membershipIds) {
        await tx.agencyMembership.upsert({
          where: { agencyId_membershipId: { agencyId: agency.id, membershipId } },
          create: { agencyId: agency.id, membershipId, isPrimary: agency.isDefault },
          update: agency.isDefault ? { isPrimary: true } : {},
        })
      }
      if (agency.isDefault) {
        await tx.agencyMembership.updateMany({
          where: { agencyId: agency.id, membershipId: { in: data.membershipIds } },
          data: { isPrimary: true },
        })
      }

      await tx.warehouse.updateMany({
        where: { companyId, agencyId: agency.id, id: { notIn: data.warehouseIds } },
        data: { agencyId: null },
      })
      await tx.warehouse.updateMany({
        where: { companyId, id: { in: data.warehouseIds } },
        data: { agencyId: agency.id },
      })
    })
    await logAction({
      userId,
      action: "UPDATE_AGENCY_ASSIGNMENTS",
      resource: "AGENCY",
      resourceId: agency.id,
      payload: { membershipCount: data.membershipIds.length, warehouseCount: data.warehouseIds.length },
    })
    revalidateAgencyManagement()
    return { success: true as const }
  }, "company.manage")
}
