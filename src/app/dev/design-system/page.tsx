import { notFound } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shared/empty-state"
import { Search, Users } from "lucide-react"
import { ReferenceControls } from "./reference-controls"

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <main className="app-surface mx-auto max-w-5xl space-y-8 p-6 sm:p-10">
    <header><h1>Référence d’interface Freelio</h1><p className="mt-2 text-muted-foreground">Composants réels, sans données client. Utilisez Tab pour inspecter le focus.</p></header>
    <ReferenceControls />
    <section className="space-y-4"><h2 className="text-lg font-semibold">Actions</h2><div className="flex flex-wrap gap-3"><Button>Enregistrer</Button><Button variant="outline">Exporter</Button><Button variant="ghost">Annuler</Button><Button variant="destructive">Supprimer</Button><Button disabled>Enregistrement…</Button><Button variant="outline" size="icon" aria-label="Rechercher"><Search /></Button></div></section>
    <section className="space-y-4"><h2 className="text-lg font-semibold">Champs et validation</h2><div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="reference-name">Nom du client</Label><Input id="reference-name" placeholder="Ex. Atelier des bassins" /></div><div className="space-y-2"><Label htmlFor="reference-email">Adresse e-mail</Label><Input id="reference-email" defaultValue="adresse-incomplete" aria-invalid="true" aria-describedby="reference-error" /><p id="reference-error" className="text-sm text-danger">Saisissez une adresse e-mail complète.</p></div></div></section>
    <section className="space-y-4"><h2 className="text-lg font-semibold">Statuts</h2><div className="flex flex-wrap gap-3"><Badge variant="secondary">Brouillon</Badge><Badge className="border-primary/20 bg-primary/10 text-primary">Envoyé</Badge><Badge className="border-success/20 bg-success/10 text-success">Payé</Badge><Badge className="border-danger/20 bg-danger/10 text-danger">En retard</Badge></div></section>
    <section className="grid gap-6 sm:grid-cols-2"><div className="rounded-lg border bg-card"><EmptyState icon={Users} title="Aucun client dans cette vue" description="Modifiez vos filtres pour retrouver les dossiers recherchés." action={<Button variant="outline">Réinitialiser la vue</Button>} /></div><div role="status" aria-label="Exemple de chargement" className="space-y-4 rounded-lg border bg-card p-6"><Skeleton className="h-5 w-40" />{[0,1,2].map((row) => <Skeleton key={row} className="h-10 w-full" />)}</div></section>
  </main>
}
