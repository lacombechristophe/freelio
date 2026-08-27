import { getContactsDirectory } from "@/actions/contacts"
import { getSavedViews } from "@/actions/views"
import { OnboardingRequired } from "@/components/shared/onboarding-required"
import { PageHeader } from "@/components/shared/page-header"
import { ContactsDirectory } from "./contacts-directory"

export default async function ContactsPage() {
  const [contacts, views] = await Promise.all([getContactsDirectory(), getSavedViews("CONTACTS")])
  if (!contacts) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant d’ajouter des contacts." />
  return <div className="space-y-7"><PageHeader eyebrow="CRM" title="Contacts" description="Tous les interlocuteurs, leurs coordonnées, leur entreprise et leur niveau d’engagement dans une vue exploitable." /><ContactsDirectory contacts={contacts} savedViews={views ?? []} /></div>
}
