import { Shell } from "@/components/layout/shell"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/login")
  let brand = { name: "Freelio", logo: null as string | null, brandColor: null as string | null }
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { companyId: true, company: { select: { name: true, logo: true, brandColor: true } } },
    })
    if (user?.company) brand = user.company
  }
  return (
    <Shell brand={brand}>
      {children}
    </Shell>
  )
}
