import { getNotificationDirectory } from "@/actions/notifications"
import { OnboardingRequired } from "@/components/shared/onboarding-required"
import { NotificationsView } from "./notifications-view"

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ search?: string | string[]; status?: string | string[]; page?: string | string[] }> }) {
  const data = await getNotificationDirectory(await searchParams)
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant de consulter vos notifications." />
  return <NotificationsView {...data} />
}
