import Link from "next/link"
import { redirect } from "next/navigation"
import { Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DEMO_READ_ONLY_MESSAGE, isPublicReadOnlyDemo } from "@/lib/demo-policy"

export const dynamic = "force-dynamic"

export default function ReadOnlyDemoPage() {
  if (!isPublicReadOnlyDemo()) redirect("/dashboard")
  return <main className="mx-auto flex min-h-dvh max-w-xl items-center px-5 py-12">
    <div className="space-y-5 rounded-xl border bg-card p-6 text-card-foreground sm:p-8">
      <Eye aria-hidden="true" className="size-7 text-primary" />
      <h1 className="text-2xl font-semibold tracking-tight">Démonstration en lecture seule</h1>
      <p className="text-sm leading-6 text-muted-foreground">{DEMO_READ_ONLY_MESSAGE}</p>
      <p className="text-sm leading-6 text-muted-foreground">Vous pouvez explorer les dossiers fictifs et leurs documents. Cette commande est réservée à un espace de travail modifiable.</p>
      <div className="flex flex-wrap gap-3">
        <Button nativeButton={false} render={<Link href="/dashboard" />}>Explorer les dossiers</Button>
        <Button nativeButton={false} variant="outline" render={<Link href="/fonctionnalites" />}>Découvrir le produit</Button>
      </div>
    </div>
  </main>
}
