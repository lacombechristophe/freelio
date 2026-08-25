"use client"

import React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileCheck2,
  Loader2,
  Mail,
  KeyRound,
  ReceiptText,
  ShieldCheck,
  TimerReset,
} from "lucide-react"
import { toast } from "sonner"

import { submitSignInWithEmail, type SignInState } from "@/actions/auth/signin"
import { AppBrand } from "@/components/shared/app-brand"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const initialSignInState: SignInState = { success: false }

const workflow = [
  { label: "Devis accepté", detail: "DEV-2026-042", icon: FileCheck2, tone: "text-primary bg-[#eaf2ff]" },
  { label: "Visite technique", detail: "Dossier Martin", icon: TimerReset, tone: "text-[#a15c00] bg-[#fff3dc]" },
  { label: "Pose planifiée", detail: "14 septembre", icon: ReceiptText, tone: "text-[#168455] bg-[#e7f6ee]" },
]

function LoginContent() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get("redirectTo") ?? "/onboarding"
  const [state, formAction, isPending] = React.useActionState(
    submitSignInWithEmail,
    initialSignInState
  )
  const [method, setMethod] = React.useState<"password" | "magic">(() => searchParams.get("mode") === "magic" ? "magic" : "password")

  React.useEffect(() => {
    if (state.error) toast.error(state.error)
    else if (state.success && state.method === "magic") toast.success("Vérifiez votre e-mail pour continuer.")
  }, [state])

  return (
    <main className="marketing-surface grid min-h-screen bg-white text-freelio-ink lg:grid-cols-[minmax(440px,0.82fr)_minmax(620px,1.18fr)]">
      <section className="flex min-h-screen flex-col border-freelio-line px-6 py-5 sm:px-10 sm:py-7 lg:border-r lg:px-14 xl:px-20">
        <div className="flex items-center justify-between">
          <AppBrand href="/" />
          <Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-freelio-muted transition-colors hover:text-freelio-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-freelio-accent">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Retour au site</span>
          </Link>
        </div>

        <div className="my-auto w-full max-w-[430px] py-14 lg:self-center">
          <p className="text-xs font-semibold uppercase text-freelio-accent">Votre espace de travail</p>
          <h1 className="marketing-display mt-4 text-[38px] font-semibold leading-[1.02] sm:text-[46px]">
            Reprenez chaque dossier exactement là où il en est.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-freelio-muted">
            {method === "password" ? "Connectez-vous à votre espace professionnel." : "Recevez un lien de connexion sécurisé par e-mail."}
          </p>

          <form action={formAction} className="mt-9 space-y-5">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <input type="hidden" name="method" value={method} />
            <div className="space-y-2">
              <Label htmlFor="email">Adresse e-mail professionnelle</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-freelio-muted" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="vous@entreprise.fr"
                  required
                  className="h-11 border-freelio-line-strong bg-white pl-10 text-freelio-ink placeholder:text-[#98a2b3] focus-visible:border-freelio-accent focus-visible:ring-freelio-accent/20"
                />
              </div>
            </div>

            {method === "password" && <div className="space-y-2">
              <div className="flex items-center justify-between gap-3"><Label htmlFor="password">Mot de passe</Label><Link href="/auth/login?mode=magic" onClick={(event) => { event.preventDefault(); setMethod("magic") }} className="text-xs font-medium text-freelio-accent hover:underline">Mot de passe oublié ?</Link></div>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-freelio-muted" />
                <Input id="password" name="password" type="password" autoComplete="current-password" placeholder="Votre mot de passe" className="h-11 border-freelio-line-strong bg-white pl-10 text-freelio-ink placeholder:text-[#98a2b3] focus-visible:border-freelio-accent focus-visible:ring-freelio-accent/20" />
              </div>
            </div>}

            <Button type="submit" size="lg" disabled={isPending} className="group w-full">
              {isPending ? <><Loader2 className="animate-spin" />Connexion en cours</> : <>{method === "password" ? "Se connecter" : "Recevoir le lien de connexion"}<ArrowRight className="transition-transform group-hover:translate-x-0.5" /></>}
            </Button>
            <p aria-live="polite" className="sr-only">{state.error ?? ""}</p>
          </form>

          <div className="mt-5 flex items-center gap-3 text-xs text-freelio-muted"><span className="h-px flex-1 bg-freelio-line" /><span>ou</span><span className="h-px flex-1 bg-freelio-line" /></div>
          <Button type="button" variant="outline" className="mt-5 w-full" onClick={() => setMethod((current) => current === "password" ? "magic" : "password")}>
            {method === "password" ? <><Mail />Utiliser un lien de connexion</> : <><KeyRound />Utiliser mon mot de passe</>}
          </Button>
          <p className="mt-5 text-center text-sm text-freelio-muted">Pas encore de compte ? <Link href="/auth/register" className="font-semibold text-freelio-accent hover:underline">Créer mon espace</Link></p>

          <div className="mt-7 flex items-start gap-2.5 border-t border-freelio-line pt-5 text-xs leading-5 text-freelio-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-freelio-success" />
            <p>Accès chiffré, tentatives limitées et sessions sécurisées. Les mots de passe ne sont jamais conservés en clair.</p>
          </div>
        </div>

        <p className="text-xs leading-5 text-freelio-muted">
          En continuant, vous accédez à un espace professionnel privé administré par votre organisation.
        </p>
      </section>

      <aside className="relative hidden min-h-screen overflow-hidden bg-freelio-canvas p-10 lg:flex lg:items-center lg:justify-center xl:p-16">
        <div className="absolute inset-0 marketing-dot-grid opacity-55" />
        <div className="relative w-full max-w-[720px]">
          <div className="mb-8 max-w-xl">
            <p className="text-xs font-semibold uppercase text-freelio-accent">Un flux continu</p>
            <h2 className="marketing-display mt-4 text-[42px] font-semibold leading-[1.04] xl:text-[52px]">Chaque chantier garde son contexte.</h2>
            <p className="mt-4 text-base leading-7 text-freelio-muted">Clients, devis, sites, équipements et interventions avancent dans le même dossier.</p>
          </div>

          <div className="rounded-2xl border border-freelio-line bg-white p-3 shadow-freelio-stage">
            <div className="flex items-center justify-between border-b border-freelio-line px-3 pb-3 pt-1">
              <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-freelio-success" /><span className="text-xs font-semibold">Chantier actif</span></div>
              <span className="font-mono text-[10px] text-freelio-muted">CHA-2026-018</span>
            </div>
            <div className="grid gap-3 p-3 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-xl bg-freelio-surface-2 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="text-[10px] font-semibold uppercase text-freelio-muted">Famille Martin</p><h3 className="marketing-display mt-2 text-2xl font-semibold">Couverture de piscine sur mesure</h3></div>
                  <span className="rounded-md bg-freelio-success-soft px-2 py-1 text-[10px] font-semibold text-freelio-success">En cours</span>
                </div>
                <div className="mt-8 space-y-2">
                  {workflow.map(({ label, detail, icon: Icon, tone }) => (
                    <div key={label} className="flex items-center gap-3 rounded-lg border border-freelio-line bg-white p-3">
                      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="size-4" /></span>
                      <div className="min-w-0"><p className="text-sm font-semibold">{label}</p><p className="mt-0.5 truncate text-xs text-freelio-muted">{detail}</p></div>
                      <Check className="ml-auto size-4 text-freelio-success" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col rounded-xl border border-freelio-line p-5">
                <p className="text-[10px] font-semibold uppercase text-freelio-muted">À encaisser</p>
                <p className="mt-3 font-mono text-3xl font-semibold">2 900 €</p>
                <p className="mt-1 text-xs text-freelio-muted">Échéance dans 12 jours</p>
                <div className="mt-6 h-2 overflow-hidden rounded-full bg-freelio-surface-2"><div className="h-full w-[72%] rounded-full bg-freelio-accent" /></div>
                <div className="mt-auto border-t border-freelio-line pt-5"><p className="text-xs font-semibold">Prochaine action</p><p className="mt-1 text-xs leading-5 text-freelio-muted">Confirmer la date de pose avec le client.</p></div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </main>
  )
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<main className="min-h-screen bg-white" />}>
      <LoginContent />
    </React.Suspense>
  )
}
