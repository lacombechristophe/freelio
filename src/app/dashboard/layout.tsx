import { Shell } from "@/components/layout/shell"
import { auth } from "@/auth"
import { ensureDailyBackup } from "@/lib/backup"
import prisma from "@/lib/prisma"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { companyId: true },
    })
    if (user?.companyId) {
      try {
        await ensureDailyBackup(session.user.id, user.companyId)
      } catch (error) {
        console.error("Automatic local backup failed", error)
      }
    }
  }
  return (
    <Shell>
      {children}
    </Shell>
  )
}
