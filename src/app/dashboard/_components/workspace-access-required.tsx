import { PageHeader } from "@/components/shared/page-header"

export function WorkspaceAccessRequired({ title }: { title: string }) {
  return <div className="workspace-page">
    <PageHeader title={title} description="Votre rôle ne permet pas de consulter cet espace." />
    <section className="workspace-panel p-5 text-sm text-muted-foreground">Demandez un accès adapté à un administrateur de votre société.</section>
  </div>
}
