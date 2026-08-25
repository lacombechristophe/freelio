import { getCommunicationDashboard } from "@/actions/communications"
import { CommunicationCenter } from "./communication-center"
import { OnboardingRequired } from "@/components/shared/onboarding-required"
import { PageHeader } from "@/components/shared/page-header"

export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const requestedTab = (await searchParams).tab
  const data = await getCommunicationDashboard()
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez d’abord le profil entreprise avant de connecter une messagerie." />
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Relation client" title="Communications" description="Centralisez les e-mails reçus et envoyés, leurs performances et les réponses clients." />
      <CommunicationCenter initialTab={["inbox", "compose", "analytics", "integrations"].includes(requestedTab || "") ? requestedTab : "inbox"} initialData={{
        ...data,
        channels: data.channels.map((item) => ({ ...item, lastSyncAt: item.lastSyncAt?.toISOString() ?? null })),
        threads: data.threads.map((thread) => ({
          ...thread,
          lastMessageAt: thread.lastMessageAt.toISOString(),
          createdAt: thread.createdAt.toISOString(),
          updatedAt: thread.updatedAt.toISOString(),
          messages: thread.messages.map((message) => ({
            ...message,
            sentAt: message.sentAt?.toISOString() ?? null,
            receivedAt: message.receivedAt?.toISOString() ?? null,
            createdAt: message.createdAt.toISOString(),
            updatedAt: message.updatedAt.toISOString(),
            events: message.events.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString(), createdAt: event.createdAt.toISOString() })),
          })),
        })),
      }} />
    </div>
  )
}
