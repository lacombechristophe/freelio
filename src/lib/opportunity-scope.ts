import type { Prisma } from "@prisma/client"

export function opportunityCompanyScope(companyId: string): Prisma.OpportunityWhereInput {
  return {
    pipeline: { companyId },
    client: { companyId },
    OR: [{ ownerMembershipId: null }, { ownerMembership: { companyId } }],
  }
}

export async function opportunityMutation<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof Error && error.message === "Opportunité introuvable") {
      return { success: false as const, error: "Opportunité introuvable" }
    }
    throw error
  }
}
