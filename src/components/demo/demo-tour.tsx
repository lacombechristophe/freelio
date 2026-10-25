import Link from "next/link"
import { withAuth } from "@/lib/auth-wrapper"
import { isDemoMode, DEMO_ACCOUNT_EMAIL } from "@/lib/demo-mode"
import { demoStoryId } from "@/lib/demo-stories"
import prisma from "@/lib/prisma"

export async function DemoTour() {
  if (!isDemoMode) return null
  const companyId = await withAuth(async context => {
    // This tour describes the complete synthetic dossier, available to its demo administrators.
    if (!["OWNER", "ADMIN"].includes(context.role) || context.agencyIds !== null) return null
    const company = await prisma.company.findFirst({ where: { id: context.companyId, email: DEMO_ACCOUNT_EMAIL }, select: { id: true } })
    if (!company) return null
    const count = await prisma.project.count({ where: { companyId: company.id, id: { in: ["vente", "chantier", "sav"].map(key => demoStoryId(company.id, `${key}-project`)) } } })
    return count === 3 ? company.id : null
  })
  if (!companyId) return null
  const stories = [
    { label: "1. Préparer une vente", detail: "Besoin, visite, devis à décider et prochaine action.", href: `/dashboard/pipeline/${demoStoryId(companyId, "vente-opportunity")}` },
    { label: "2. Suivre un chantier", detail: "Jalons, relevé, temps et facture brouillon.", href: `/dashboard/projets/${demoStoryId(companyId, "chantier-project")}` },
    { label: "3. Préparer un SAV", detail: "Équipement, diagnostic et intervention planifiée.", href: `/dashboard/service/tickets/${demoStoryId(companyId, "sav-ticket")}` },
  ]
  return <section aria-labelledby="demo-tour-title" className="rounded-lg border bg-card p-5">
    <h2 id="demo-tour-title" className="text-base font-semibold">Explorer trois dossiers fictifs</h2>
    <p className="mt-1 text-sm text-muted-foreground">Un parcours de cinq minutes. Dates fixes, documents de démonstration et aucun envoi réel.</p>
    <div className="mt-4 grid gap-3 lg:grid-cols-3">{stories.map(story => <Link key={story.href} href={story.href} className="rounded-md border p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="block text-sm font-semibold text-primary">{story.label}</span><span className="mt-1 block text-sm text-muted-foreground">{story.detail}</span>
    </Link>)}</div>
  </section>
}
