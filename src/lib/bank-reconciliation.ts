import "server-only"
import { Prisma } from "@prisma/client"
import prisma, { type TransactionClient } from "@/lib/prisma"
import { withAuth, type AuthContext } from "@/lib/auth-wrapper"

export async function withBankReconciliation<T>(action: (tx: TransactionClient, context: AuthContext) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await withAuth(context => prisma.$transaction(tx => action(tx, context), { isolationLevel: "Serializable" }), "finance.write")
    } catch (error) {
      // A serialization failure rolls back every SQL effect. Recheck membership
      // and balances on retry; never replay a validation or uncertain commit error.
      if (attempt >= 3 || !(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") throw error
    }
  }
}
