import { getMarketingIntelligenceDashboard } from "@/actions/marketing"
import { MarketingIntelligence } from "./marketing-intelligence"
import { OnboardingRequired } from "@/components/shared/onboarding-required"
import { PageHeader } from "@/components/shared/page-header"

export default async function MarketingPage() {
  const data = await getMarketingIntelligenceDashboard()
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant de définir le scoring." />
  return <div className="space-y-7"><PageHeader eyebrow="Qualification" title="Scoring & segments" description="Priorisez les prospects avec des règles explicables et créez des listes actives pour vos séquences." /><MarketingIntelligence initialData={{ ...data, rules: data.rules.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })), segments: data.segments.map((segment) => ({ ...segment, lastBuiltAt: segment.lastBuiltAt?.toISOString() ?? null, createdAt: segment.createdAt.toISOString(), updatedAt: segment.updatedAt.toISOString(), memberships: segment.memberships.map((member) => ({ ...member, addedAt: member.addedAt.toISOString() })) })), leads: data.leads.map((lead) => ({ ...lead, scoreUpdatedAt: lead.scoreUpdatedAt?.toISOString() ?? null, createdAt: lead.createdAt.toISOString() })) }} /></div>
}
