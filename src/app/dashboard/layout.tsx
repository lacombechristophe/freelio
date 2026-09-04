import { Shell } from "@/components/layout/shell"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { titleForPath } from "@/components/layout/route-titles"

export async function generateMetadata(): Promise<Metadata> {
  const pathname = (await headers()).get("x-freelio-pathname") ?? "/dashboard"
  return { title: titleForPath(pathname) }
}

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
