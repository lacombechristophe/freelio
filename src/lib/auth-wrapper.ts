import { auth } from "@/auth"
import { requestContext } from "@/lib/context"
import { hasPermission, normalizeCompanyRole, type Permission } from "@/lib/permissions"
import prisma from "@/lib/prisma"

export class AuthorizationError extends Error {
  constructor(message = "Accès refusé") {
    super(message)
    this.name = "AuthorizationError"
  }
}

export type AuthContext = {
  userId: string
  companyId: string
  membershipId: string
  role: ReturnType<typeof normalizeCompanyRole>
}

export async function resolveAuthContext(): Promise<AuthContext | null> {
  const session = await auth()

  if (!session?.user?.id) {
    throw new AuthorizationError("Authentification requise")
  }

  const userId = session.user.id

  // Read companyId from the JWT token (cached at login, avoids a DB round-trip)
  const token = session as any
  let companyId: string | null = token?.companyId ?? null

  // Fallback to DB lookup when companyId is not yet in the token (e.g. first onboarding)
  if (!companyId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    })
    companyId = user?.companyId ?? null
  }

  if (!companyId) {
    return null
  }

  const membership = await prisma.membership.findUnique({
    where: { companyId_userId: { companyId, userId } },
    select: { id: true, role: true, status: true },
  })

  if (!membership || membership.status !== "ACTIVE") {
    throw new AuthorizationError("Vous n'avez plus accès à cet espace de travail")
  }

  return {
    userId,
    companyId,
    membershipId: membership.id,
    role: normalizeCompanyRole(membership.role),
  }
}

export async function withAuth<T>(
  action: (context: AuthContext) => Promise<T>,
  permission?: Permission,
): Promise<T> {
  const context = await resolveAuthContext()

  // Dashboard callers already handle the pre-onboarding state through redirects.
  if (!context) return null as T

  if (permission && !hasPermission(context.role, permission)) {
    throw new AuthorizationError("Vous n'avez pas les droits nécessaires pour cette action")
  }

  return requestContext.run({ ...context, actionPermission: permission }, () => action(context))
}
