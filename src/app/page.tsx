import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Boxes, BriefcaseBusiness, ChartNoAxesCombined, ShieldCheck, Wrench } from "lucide-react"

import { AppBrand } from "@/components/shared/app-brand"

export const metadata: Metadata = {
  title: "CRM & opérations — Espace de gestion",
  description: "Pilotage commercial, chantiers, stock, interventions et finance dans un espace configurable.",
}

export default function Home() {
  const capabilities = [
    { icon: ChartNoAxesCombined, title: "Commercial", text: "Prospects, pipeline, devis et commandes dans une chronologie unique." },
    { icon: BriefcaseBusiness, title: "Chantiers", text: "Relevés techniques, jalons, documents et contrôle de fin de pose." },
    { icon: Boxes, title: "Achats & stock", text: "Fournisseurs, dépôts, réservations, réceptions et livraisons tracées." },
    { icon: Wrench, title: "SAV & entretien", text: "Parc installé, tickets, interventions signées et contrats de maintenance." },
  ]

  return (
    <main className="min-h-screen bg-[#f5f7fa] text-[#14285a]">
      <header className="border-b border-[#dfe5ec] bg-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-10">
          <AppBrand href="/" />
          <Link href="/auth/login" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#14285a] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1b376f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ed6c22] focus-visible:ring-offset-2">
            Ouvrir l’espace <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#dfe5ec] bg-white">
        <div className="absolute inset-y-0 right-0 hidden w-[42%] bg-[linear-gradient(135deg,#14285a_0%,#1c4778_72%,#ed6c22_72%,#ed6c22_100%)] lg:block" />
        <div className="relative mx-auto grid max-w-7xl lg:grid-cols-[1.12fr_0.88fr]">
          <div className="px-6 py-20 sm:py-28 lg:px-10 lg:py-32">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ed6c22]">CRM & opérations</p>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl">Du premier contact à l’entretien, un seul dossier fiable.</h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-[#607087] sm:text-lg">L’espace interne centralise l’activité commerciale, les relevés de bassin, les commandes, la pose, le stock, le SAV et la facturation.</p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/auth/login" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-[#ed6c22] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#d75d17] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ed6c22] focus-visible:ring-offset-2">Accéder au CRM <ArrowRight className="size-4" /></Link>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-[#607087]"><ShieldCheck className="size-4 text-emerald-600" />Accès réservé aux équipes autorisées</span>
            </div>
          </div>
          <div className="relative hidden min-h-full lg:block" aria-hidden="true"><div className="absolute bottom-16 left-14 right-12 rounded-2xl border border-white/20 bg-white/10 p-6 text-white backdrop-blur-sm"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/65">Continuité opérationnelle</p><p className="mt-3 text-2xl font-semibold">Prospect → devis → chantier → parc installé</p><div className="mt-8 grid grid-cols-4 gap-2">{["Lead", "Commande", "Pose", "SAV"].map((label, index) => <div key={label} className="rounded-lg border border-white/15 bg-white/10 px-3 py-3"><span className="text-[10px] text-white/55">0{index + 1}</span><p className="mt-1 text-xs font-semibold">{label}</p></div>)}</div></div></div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-[#dfe5ec] bg-[#dfe5ec] md:grid-cols-2 xl:grid-cols-4">
          {capabilities.map(({ icon: Icon, title, text }) => <article key={title} className="bg-white p-6"><span className="grid size-10 place-items-center rounded-xl bg-[#14285a]/8 text-[#14285a]"><Icon className="size-4" /></span><h2 className="mt-5 text-base font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-[#607087]">{text}</p></article>)}
        </div>
        <footer className="mt-12 flex flex-col gap-3 border-t border-[#dfe5ec] pt-6 text-xs text-[#607087] sm:flex-row sm:items-center sm:justify-between"><p>Outil métier privé et configurable.</p><p>Le nom, le logo et les couleurs sont définis dans le profil entreprise.</p></footer>
      </section>
    </main>
  )
}
