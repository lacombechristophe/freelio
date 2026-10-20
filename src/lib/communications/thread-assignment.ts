import "server-only"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { getContext, requestContext } from "@/lib/context"
import { hasPermission, normalizeCompanyRole } from "@/lib/permissions"

export async function changeThreadAssignment(companyId: string, userId: string, input: unknown) {
  const { threadId, operation } = z.object({ threadId: z.string().cuid(), operation: z.enum(["CLAIM", "RELEASE"]) }).parse(input)
  const context = getContext()
  if (!context || context.companyId !== companyId || context.userId !== userId) throw new Error("Contexte de messagerie invalide")
  return prisma.$transaction(async tx => {
    const membership = await tx.membership.findUnique({ where: { companyId_userId: { companyId, userId } }, select: { id: true, role: true, status: true } })
    const role = normalizeCompanyRole(membership?.role || "")
    if (!membership || membership.status !== "ACTIVE" || !hasPermission(role, "automation.write")) throw new Error("Accès en écriture à la messagerie requis")
    // Apply the current role's mailbox scope inside the same transaction.
    return requestContext.run({ ...context, role, membershipId: membership.id }, async () => {
      const thread = await tx.emailThread.findFirst({ where: { id: threadId, companyId }, select: { id: true, assignedUserId: true } })
      if (!thread) return { success: false as const, error: "Conversation introuvable" }
      const canReleaseAnother = operation === "RELEASE" && ["OWNER", "ADMIN"].includes(role)
      const saved = await tx.emailThread.updateMany({ where: { id: threadId, companyId,
        ...(canReleaseAnother ? { assignedUserId: thread.assignedUserId } : { OR: [{ assignedUserId: null }, { assignedUserId: userId }] }) },
        data: { assignedUserId: operation === "CLAIM" ? userId : null } })
      if (saved.count !== 1) return { success: false as const, error: "Cette conversation est déjà prise en charge par un autre membre. Actualisez la liste." }
      await tx.auditLog.create({ data: { userId, action: "UPDATE_EMAIL_THREAD", resource: "EMAIL_THREAD", resourceId: threadId,
        payload: { companyId, operation, previousAssignmentPresent: thread.assignedUserId !== null, previousAssignmentWasOwn: thread.assignedUserId === userId } } })
      return { success: true as const }
    })
  })
}
