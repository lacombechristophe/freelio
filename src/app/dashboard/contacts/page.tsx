import { getContactDirectory } from "@/actions/directories"
import { parseDirectoryQuery } from "@/lib/directory-query"
import { getSavedViews } from "@/actions/views"
import { OnboardingRequired } from "@/components/shared/onboarding-required"
import { PageHeader } from "@/components/shared/page-header"
import { ContactsDirectory } from "./contacts-directory"

export default async function ContactsPage({ searchParams }: PageProps<"/dashboard/contacts">) {
  const params = await searchParams
  const query = parseDirectoryQuery(typeof params.view === "string" ? params.view : null)
  const [data, views] = await Promise.all([getContactDirectory(query), getSavedViews("CONTACTS")])
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant d’ajouter des contacts." />
  return <div className="workspace-page"><PageHeader className="workspace-page-header" title="Contacts" description="Retrouvez les coordonnées et le suivi de vos interlocuteurs." /><ContactsDirectory initial={{ data, query }} savedViews={views ?? []} /></div>
}
