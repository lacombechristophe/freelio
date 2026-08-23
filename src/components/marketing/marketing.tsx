import Link from "next/link"
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  CloudDownload,
  Euro,
  ExternalLink,
  FileCheck2,
  FileText,
  Gauge,
  Landmark,
  LockKeyhole,
  Minus,
  ReceiptText,
  ShieldCheck,
  Target,
  WalletCards,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import {
  HeroProductScene,
  HeroIntroMotion,
  MarketingDesktopNav,
  MarketingScrollProgress,
  MobileNav,
  RouteHeroVisual,
  SectionReveal,
  WorkflowStory,
} from "@/components/marketing/marketing-motion"
import { cn } from "@/lib/utils"

const shell = "mx-auto w-full max-w-[1380px] px-5 sm:px-8 lg:px-10"

const navItems = [
  { label: "Produit", href: "/fonctionnalites" },
  { label: "Solutions", href: "/#workflow" },
  { label: "Factur-X", href: "/conformite" },
  { label: "Tarifs", href: "/tarifs" },
  { label: "Ressources", href: "/faq" },
]

const pricingPlans = [
  {
    name: "Alpha",
    price: "0 €",
    cadence: "pendant la phase privée",
    description: "Pour tester Freelio sur vos missions réelles et participer à la construction du produit.",
    cta: "Rejoindre l’alpha",
    href: "/auth/login",
    features: ["Clients et missions", "Devis et factures", "Exports complets", "Support produit direct"],
  },
  {
    name: "Solo",
    price: "19 €",
    cadence: "par mois HT, tarif indicatif",
    description: "Le cockpit complet pour une activité indépendante qui veut relier travail, documents et paiement.",
    cta: "Commencer gratuitement",
    href: "/auth/login",
    featured: true,
    features: ["Tout Alpha", "Contrats et temps", "Factur-X", "Relances et suivi TVA"],
  },
  {
    name: "Studio",
    price: "39 €",
    cadence: "par mois HT, tarif indicatif",
    description: "Pour les petits collectifs qui partagent des clients et un processus commercial commun.",
    cta: "Demander un accès",
    href: "/auth/login",
    features: ["Tout Solo", "Plusieurs collaborateurs", "Modèles partagés", "Support prioritaire"],
  },
]

const pricingRows = [
  ["Devis et factures Factur-X", [true, true, true]],
  ["Contrats et signatures", [false, true, true]],
  ["Projets, jalons et temps", [false, true, true]],
  ["Relances et encaissements", [true, true, true]],
  ["Exports et sauvegardes", [true, true, true]],
  ["Support", ["Direct", "Email", "Prioritaire"]],
] as const

const faqs = [
  {
    question: "Freelio remplace-t-il mon expert-comptable ?",
    answer: "Non. Freelio structure votre activité, vos documents et vos exports. Les décisions comptables et fiscales restent à valider avec votre expert-comptable.",
  },
  {
    question: "Freelio est-il une plateforme agréée ?",
    answer: "Non. Freelio prépare des documents et des données propres, notamment au format Factur-X. La transmission réglementaire passe par la plateforme agréée choisie par votre entreprise.",
  },
  {
    question: "Puis-je récupérer mes données ?",
    answer: "Oui. Les clients, documents, temps, paiements et pièces associées sont conçus pour rester exportables. Votre historique ne doit pas devenir une dépendance.",
  },
  {
    question: "À qui s’adresse l’alpha ?",
    answer: "Aux indépendants français qui gèrent plusieurs missions et veulent tester un flux continu, du premier devis jusqu’au paiement.",
  },
  {
    question: "Une carte bancaire est-elle demandée ?",
    answer: "Non. L’accès à l’alpha ne demande aucune carte bancaire et peut être arrêté à tout moment.",
  },
]

function MarketingFrame({ children }: { children: ReactNode }) {
  return (
    <div className="marketing-surface min-h-screen overflow-x-clip bg-freelio-canvas text-freelio-ink selection:bg-freelio-accent-soft selection:text-freelio-ink">
      <a href="#contenu-principal" className="fixed left-4 top-3 z-[60] inline-flex min-h-11 -translate-y-20 items-center rounded-md bg-freelio-ink px-4 py-2 text-sm font-semibold text-white transition-transform focus:translate-y-0">Aller au contenu</a>
      <MarketingScrollProgress />
      <Header />
      <main id="contenu-principal" tabIndex={-1}>{children}</main>
      <Footer />
    </div>
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-freelio-line bg-white/90 backdrop-blur-xl">
      <div className={cn(shell, "relative flex h-[68px] items-center justify-between")}>
        <Link href="/" aria-label="Accueil Freelio" className="flex min-h-11 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-freelio-accent focus-visible:ring-offset-4">
          <LogoMark />
          <span className="marketing-display text-xl font-bold text-freelio-ink">Freelio</span>
        </Link>

        <MarketingDesktopNav />

        <div className="hidden items-center gap-3 md:flex">
          <Link href="/auth/login" className="flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-freelio-muted transition-colors hover:text-freelio-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-freelio-accent focus-visible:ring-offset-4">Se connecter</Link>
          <Link href="/auth/login" className="group inline-flex h-11 items-center gap-2 rounded-md bg-freelio-accent px-4 text-sm font-semibold text-white shadow-[0_2px_6px_rgba(11,99,246,0.2)] transition-[background-color,transform,box-shadow] hover:bg-freelio-accent-hover hover:shadow-[0_4px_8px_rgba(11,99,246,0.22)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-freelio-accent focus-visible:ring-offset-2">
            Essayer gratuitement
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <MobileNav />
      </div>
    </header>
  )
}

export function MarketingHome() {
  return (
    <MarketingFrame>
      <Hero />
      <ProofRail />
      <WorkflowStory />
      <ValueSystem />
      <ComplianceSection />
      <PricingSection compact />
      <FAQSection compact />
      <FinalCTA />
    </MarketingFrame>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-freelio-line bg-white pt-10 sm:pt-14">
      <div aria-hidden className="marketing-dot-grid absolute inset-0 opacity-55" />
      <HeroIntroMotion className={cn(shell, "relative z-10 text-center")}>
        <div className="mx-auto inline-flex min-h-8 items-center gap-2 rounded-full border border-freelio-line bg-white/90 px-3 text-[11px] font-semibold text-freelio-muted shadow-freelio-float">
          <span className="size-1.5 rounded-full bg-freelio-success shadow-[0_0_0_4px_var(--color-freelio-success-soft)]" />
          Cockpit français pour indépendants
          <ChevronRight className="size-3 text-freelio-accent" />
        </div>

        <h1 className="marketing-display mx-auto mt-7 max-w-[1060px] text-[46px] font-bold leading-[0.98] text-freelio-ink sm:text-[66px] lg:text-[78px]">
          Freelio. Tout votre business freelance, enfin relié.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-freelio-muted sm:text-lg sm:leading-8">Clients, missions, documents et trésorerie avancent ensemble, du premier devis au dernier paiement.</p>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <PrimaryLink href="/auth/login">Essayer gratuitement</PrimaryLink>
          <SecondaryLink href="#workflow">Voir comment ça marche</SecondaryLink>
        </div>
        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-freelio-muted"><ShieldCheck className="size-4 text-freelio-success" />Sans carte bancaire · Données hébergées en France · Factur-X</p>
      </HeroIntroMotion>

      <div className="relative z-10 mt-6 overflow-hidden sm:mt-9 lg:-mt-16">
        <HeroProductScene />
      </div>
    </section>
  )
}

function ProofRail() {
  const items = [
    [FileCheck2, "Factur-X", "Des documents lisibles et des données structurées."],
    [CloudDownload, "Portable", "Clients, pièces et historiques restent exportables."],
    [LockKeyhole, "Sous contrôle", "Vos décisions restent rattachées au bon dossier."],
  ]

  return (
    <section className="border-b border-freelio-line bg-white">
      <SectionReveal className={cn(shell, "grid divide-y divide-freelio-line lg:grid-cols-[1.2fr_repeat(3,1fr)] lg:divide-x lg:divide-y-0")}>
        <div className="flex min-h-28 items-center gap-4 py-6 pr-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-freelio-accent text-white"><BadgeCheck className="size-4" /></span>
          <div><p className="text-xs font-semibold text-freelio-accent">CONÇU POUR LES INDÉPENDANTS FRANÇAIS</p><p className="mt-2 max-w-xs text-sm leading-6 text-freelio-muted">Trois engagements concrets, pas une liste de fonctions génériques.</p></div>
        </div>
        {items.map(([Icon, label, copy]) => {
          const ItemIcon = Icon as LucideIcon
          return <div key={label as string} className="flex min-h-28 items-start gap-3 py-6 lg:px-5 lg:last:pr-0"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-freelio-accent-soft text-freelio-accent"><ItemIcon className="size-3.5" /></span><div><p className="text-sm font-semibold text-freelio-ink">{label as string}</p><p className="mt-1.5 text-xs leading-5 text-freelio-muted">{copy as string}</p></div></div>
        })}
      </SectionReveal>
    </section>
  )
}

function ValueSystem() {
  return (
    <section id="fonctionnalites" className="bg-freelio-canvas py-20 sm:py-28">
      <div className={shell}>
        <SectionReveal className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7"><p className="marketing-kicker">Un seul système de travail</p><h2 className="marketing-display mt-5 max-w-3xl text-[42px] font-semibold leading-[1.02] text-freelio-ink sm:text-[60px]">Moins d’outils. Plus de continuité.</h2></div>
          <p className="max-w-xl text-base leading-7 text-freelio-muted lg:col-span-5 lg:justify-self-end">Freelio n’empile pas des modules. Il conserve ce qui a déjà été décidé pour préparer la prochaine action.</p>
        </SectionReveal>

        <SectionReveal className="mt-14 grid gap-px overflow-hidden rounded-freelio-frame border border-freelio-line bg-freelio-line lg:grid-cols-12" delay={0.06}>
          <section className="bg-white p-6 sm:p-8 lg:col-span-7">
            <FeatureHeading icon={Target} label="Mémoire de mission" title="Le contexte reste attaché au travail." text="Le besoin, le budget, les validations et les documents parlent toujours du même dossier." />
            <div className="mt-10 grid gap-px bg-freelio-line sm:grid-cols-[0.82fr_1.18fr]">
              <div className="bg-freelio-surface-2 p-4"><p className="text-[9px] font-semibold uppercase text-freelio-muted">Client actif</p><p className="marketing-display mt-3 text-xl font-semibold text-freelio-ink">Studio Brume</p><p className="mt-1 text-xs text-freelio-muted">Refonte du cockpit client</p><div className="mt-6 flex items-center justify-between border-t border-freelio-line pt-3"><span className="text-[10px] text-freelio-muted">Budget</span><span className="font-mono text-xs font-semibold text-freelio-ink">2 900 € HT</span></div></div>
              <div className="bg-white p-4"><div className="flex items-center justify-between"><p className="text-[9px] font-semibold uppercase text-freelio-muted">Éléments reliés</p><span className="font-mono text-[9px] text-freelio-accent">04</span></div>{["Brief validé", "Devis signé", "13h40 réalisées", "Facture préparée"].map((item, index) => <div key={item} className="flex items-center gap-3 border-b border-freelio-line py-3 text-[11px] last:border-0"><span className={cn("grid size-5 place-items-center rounded-full text-[8px]", index < 3 ? "bg-freelio-accent-soft text-freelio-accent" : "bg-freelio-surface-2 text-freelio-muted")}>{index + 1}</span><span className="font-medium text-freelio-ink">{item}</span></div>)}</div>
            </div>
          </section>

          <section className="bg-white p-6 sm:p-8 lg:col-span-5">
            <FeatureHeading icon={Gauge} label="Pilotage" title="Le bon chiffre au moment utile." text="Pas un mur de graphiques : les montants qui déclenchent une décision." />
            <div className="mt-10 divide-y divide-freelio-line border-y border-freelio-line">
              {[["À facturer", "1 940 €", "6h20 validées"], ["À relancer", "2 735 €", "2 factures"], ["Seuil TVA", "31,6 %", "suivi indicatif"]].map(([label, value, note]) => <div key={label} className="grid grid-cols-[1fr_auto] items-center gap-3 py-4"><div><p className="text-[10px] font-medium text-freelio-ink">{label}</p><p className="mt-1 text-[9px] text-freelio-muted">{note}</p></div><p className="font-mono text-lg font-semibold text-freelio-ink">{value}</p></div>)}
            </div>
          </section>

          <section className="bg-white p-6 sm:p-8 lg:col-span-5">
            <FeatureHeading icon={FileText} label="Documents" title="Chaque document reprend la bonne histoire." text="Devis, contrat et facture sont générés depuis le même contexte commercial." />
            <DocumentPreviewGrid />
          </section>

          <section className="bg-freelio-accent p-6 text-white sm:p-8 lg:col-span-7">
            <FeatureHeading icon={WalletCards} label="Encaissement" title="La mission ne disparaît pas après la facture." text="Échéance, relances et preuve de paiement restent dans le fil jusqu’à l’encaissement." invert />
            <div className="mt-10 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="border-l border-white/15 pl-5">
                {[["28 juin", "Facture envoyée", true], ["25 juillet", "Rappel courtois", true], ["4 août", "Relance J+7", false]].map(([date, label, done]) => <div key={label as string} className="relative flex items-center justify-between gap-5 border-b border-white/15 py-3 last:border-0"><span className={cn("absolute -left-[24px] size-2 rounded-full ring-4 ring-freelio-accent", done ? "bg-white" : "bg-white/35")} /><span className="text-xs font-medium text-white">{label as string}</span><span className="font-mono text-[9px] text-white/65">{date as string}</span></div>)}
              </div>
              <div className="sm:text-right"><p className="text-[9px] uppercase text-white/50">Montant suivi</p><p className="mt-1 font-mono text-3xl font-semibold">3 480 €</p></div>
            </div>
          </section>
        </SectionReveal>
      </div>
    </section>
  )
}

function FeatureHeading({ icon: Icon, label, title, text, invert = false }: { icon: LucideIcon; label: string; title: string; text: string; invert?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2"><Icon className={cn("size-4", invert ? "text-white" : "text-freelio-accent")} /><p className={cn("text-[10px] font-semibold uppercase", invert ? "text-white/65" : "text-freelio-muted")}>{label}</p></div>
      <h3 className={cn("marketing-display mt-5 max-w-lg text-2xl font-semibold leading-tight sm:text-3xl", invert ? "text-white" : "text-freelio-ink")}>{title}</h3>
      <p className={cn("mt-3 max-w-lg text-sm leading-6", invert ? "text-white/60" : "text-freelio-muted")}>{text}</p>
    </div>
  )
}

function DocumentPreviewGrid() {
  const documents = [
    {
      type: "DEVIS",
      number: "DEV-2026-024",
      status: "Accepté",
      statusClass: "bg-freelio-success-soft text-freelio-success",
      icon: FileText,
      client: "Atelier Rivet",
      meta: "Valide jusqu’au 30 juin",
      lines: [["Audit & cadrage", "1 800 €"], ["Design interface", "3 200 €"]],
      totalLabel: "Total HT",
      total: "5 000 €",
    },
    {
      type: "CONTRAT",
      number: "CON-2026-018",
      status: "Signé",
      statusClass: "bg-freelio-accent-soft text-freelio-accent",
      icon: FileCheck2,
      client: "Mission produit",
      meta: "Atelier Rivet · Freelio",
      lines: [["Démarrage", "03 juin"], ["Échéance", "28 juin"]],
      totalLabel: "Signature",
      total: "A. Rivet",
    },
    {
      type: "FACTURE",
      number: "FAC-2026-041",
      status: "Factur-X",
      statusClass: "bg-freelio-accent text-white",
      icon: ReceiptText,
      client: "Atelier Rivet",
      meta: "Échéance · 02 juillet",
      lines: [["Conception UI", "3 200 €"], ["Intégration", "1 800 €"]],
      totalLabel: "Net à payer",
      total: "6 000 €",
    },
  ]

  return (
    <div className="mt-8 grid grid-cols-1 items-start gap-2 sm:grid-cols-3" aria-label="Aperçu de documents reliés">
      {documents.map((document, index) => {
        const Icon = document.icon
        return (
          <article
            key={document.type}
            className={cn(
              "min-w-0 overflow-hidden rounded-lg border border-freelio-line bg-white shadow-[0_4px_8px_rgba(16,24,40,0.07)]",
              index === 0 && "sm:mt-4",
              index === 1 && "sm:mt-2",
              index === 2 && "border-freelio-accent-line"
            )}
          >
            <div className="border-b border-freelio-line p-2.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className="flex min-w-0 items-center gap-1.5 text-[7px] font-semibold text-freelio-ink"><Icon className="size-3 shrink-0 text-freelio-accent" /><span className="truncate">{document.type}</span></span>
                <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[6px] font-semibold", document.statusClass)}>{document.status}</span>
              </div>
              <p className="mt-2 font-mono text-[6px] text-freelio-muted">{document.number}</p>
            </div>
            <div className="p-2.5">
              <p className="truncate text-[8px] font-semibold text-freelio-ink">{document.client}</p>
              <p className="mt-1 truncate text-[6px] text-freelio-muted">{document.meta}</p>
              <div className="mt-3 space-y-2 border-y border-freelio-line py-2">
                {document.lines.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-1 text-[6px] leading-3">
                    <span className="truncate text-freelio-muted">{label}</span>
                    <span className="font-medium tabular-nums text-freelio-ink">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <p className="text-[6px] uppercase text-freelio-muted">{document.totalLabel}</p>
                <p className={cn("mt-1 truncate text-[11px] font-semibold tabular-nums text-freelio-ink", document.type === "CONTRAT" && "font-serif italic")}>{document.total}</p>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function ComplianceSection() {
  const readiness = [
    [FileCheck2, "Factur-X / EN 16931", "Prêt"],
    [LockKeyhole, "Piste d’audit et archivage", "Prêt"],
    [BookOpenCheck, "Livre de recettes et TVA", "Prêt"],
    [CloudDownload, "Exports comptables complets", "Prêt"],
    [Landmark, "Connexion à votre plateforme agréée", "En cours"],
  ]

  return (
    <section id="conformite" className="scroll-mt-20 border-y border-freelio-line bg-white py-20 sm:py-28">
      <SectionReveal className={cn(shell, "grid gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16")}>
        <div>
          <p className="marketing-kicker">Facturation électronique</p>
          <h2 className="marketing-display mt-5 max-w-2xl text-[42px] font-semibold leading-[1.02] text-freelio-ink sm:text-[60px]">Préparer 2026, sans promesse magique.</h2>
          <p className="mt-6 max-w-xl text-base leading-7 text-freelio-muted">Freelio prépare vos documents, vos données et vos preuves. La transmission réglementaire reste portée par la plateforme agréée que vous choisissez.</p>
          <div className="mt-8"><SecondaryLink href="/conformite">Comprendre le périmètre</SecondaryLink></div>
        </div>

        <div className="rounded-lg border border-freelio-line bg-freelio-surface-2 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-5 border-b border-freelio-line pb-5"><div><p className="text-[10px] font-semibold uppercase text-freelio-accent">État de préparation</p><p className="marketing-display mt-2 text-2xl font-semibold text-freelio-ink">Un socle propre avant la transmission</p></div><ShieldCheck className="size-5 text-freelio-accent" /></div>
          <div>
            {readiness.map(([Icon, title, status], index) => {
              const ItemIcon = Icon as LucideIcon
              return <div key={title as string} className={cn("grid grid-cols-[32px_1fr_auto] items-center gap-3 py-4", index > 0 && "border-t border-freelio-line")}><span className="grid size-8 place-items-center rounded-md bg-white text-freelio-accent"><ItemIcon className="size-3.5" /></span><p className="text-sm font-medium text-freelio-ink">{title as string}</p><span className={cn("rounded-full px-2.5 py-1 text-[9px] font-semibold", status === "Prêt" ? "bg-freelio-success-soft text-freelio-success" : "bg-freelio-warning-soft text-freelio-warning")}>{status as string}</span></div>
            })}
          </div>
          <p className="border-t border-freelio-line pt-4 text-xs leading-5 text-freelio-muted">Les calendriers officiels peuvent évoluer. Les décisions fiscales restent à confirmer avec votre expert-comptable.</p>
        </div>
      </SectionReveal>

      <SectionReveal className={cn(shell, "mt-16")} delay={0.06}>
        <div className="grid gap-8 border-t border-freelio-line pt-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          <div>
            <div className="flex items-center gap-2 text-freelio-accent"><CalendarDays className="size-4" /><p className="text-xs font-semibold">CALENDRIER OFFICIEL</p></div>
            <h3 className="marketing-display mt-4 text-3xl font-semibold text-freelio-ink">Deux dates. Deux responsabilités différentes.</h3>
            <a href="https://www.impots.gouv.fr/professionnel/questions/partir-de-quand-suis-je-concerne-par-la-reforme-de-la-facturation" target="_blank" rel="noreferrer" className="group mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-freelio-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-freelio-accent">
              Vérifier sur impots.gouv.fr<ExternalLink className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2">
            <li className="rounded-lg border border-freelio-accent-line bg-freelio-accent-soft p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4"><span className="font-mono text-xs font-semibold text-freelio-accent">01 SEPT. 2026</span><span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-semibold text-freelio-accent">RÉCEPTION</span></div>
              <h4 className="marketing-display mt-6 text-xl font-semibold text-freelio-ink">Toutes les entreprises doivent pouvoir recevoir.</h4>
              <p className="mt-3 text-sm leading-6 text-freelio-muted">Les grandes entreprises et ETI commencent également à émettre au format électronique.</p>
            </li>
            <li className="rounded-lg border border-freelio-line bg-freelio-surface-2 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4"><span className="font-mono text-xs font-semibold text-freelio-ink">01 SEPT. 2027</span><span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-semibold text-freelio-muted">ÉMISSION</span></div>
              <h4 className="marketing-display mt-6 text-xl font-semibold text-freelio-ink">TPE, PME et micro-entreprises passent à l’émission.</h4>
              <p className="mt-3 text-sm leading-6 text-freelio-muted">L’obligation d’émission et l’e-reporting s’appliquent alors aux plus petites structures.</p>
            </li>
          </ol>
        </div>
      </SectionReveal>
    </section>
  )
}

function PricingSection({ compact = false }: { compact?: boolean }) {
  return (
    <section id="tarifs" className="scroll-mt-20 bg-freelio-canvas py-20 sm:py-28">
      <div className={shell}>
        <SectionReveal className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7"><p className="marketing-kicker">Tarification</p><h2 className="marketing-display mt-5 max-w-3xl text-[42px] font-semibold leading-[1.02] text-freelio-ink sm:text-[60px]">Un prix lisible. Aucun outil à empiler.</h2></div>
          <div className="lg:col-span-5 lg:justify-self-end"><p className="max-w-lg text-base leading-7 text-freelio-muted">L’alpha est gratuite. Les tarifs suivants exposent clairement la direction prévue à la sortie de cette phase.</p>{compact && <div className="mt-5"><SecondaryLink href="/tarifs">Voir tous les détails</SecondaryLink></div>}</div>
        </SectionReveal>

        <SectionReveal className="mt-14 hidden overflow-hidden rounded-freelio-frame border border-freelio-line-strong bg-freelio-line shadow-[0_8px_18px_rgba(16,24,40,0.05)] lg:block" delay={0.06}>
          <div className="grid grid-cols-[1.18fr_repeat(3,minmax(0,1fr))] gap-px">
            <div className="flex flex-col justify-between bg-freelio-surface-2 p-5">
              <span className="grid size-9 place-items-center rounded-lg border border-freelio-line bg-white text-freelio-accent"><BadgeCheck className="size-4" /></span>
              <div className="mt-8">
                <p className="text-sm font-semibold text-freelio-ink">Comparer les plans</p>
                <p className="mt-1 max-w-[220px] text-xs leading-5 text-freelio-muted">Six critères concrets, sans option cachée ni engagement.</p>
                <div className="mt-4 flex flex-wrap gap-2 text-[9px] font-medium text-freelio-muted"><span className="rounded-full border border-freelio-line bg-white px-2 py-1">Alpha gratuite</span><span className="rounded-full border border-freelio-line bg-white px-2 py-1">Sans carte</span></div>
              </div>
            </div>
            {pricingPlans.map((plan) => <PricingHeader key={plan.name} plan={plan} />)}
            {pricingRows.map(([label, values]) => <div key={label} className="group/row contents"><div className="bg-white px-5 py-4 text-sm font-medium text-freelio-ink transition-colors group-hover/row:bg-freelio-surface-2">{label}</div>{values.map((value, index) => <div key={`${label}-${index}`} className={cn("grid min-h-13 place-items-center bg-white px-3 text-xs transition-colors group-hover/row:bg-freelio-surface-2", index === 1 && "bg-freelio-accent-soft/60 group-hover/row:bg-freelio-accent-soft")}>{typeof value === "boolean" ? <span aria-label={value ? "Inclus" : "Non inclus"} className={cn("grid size-6 place-items-center rounded-full", value ? "bg-freelio-success-soft text-freelio-success" : "bg-freelio-surface-2 text-freelio-muted")}>{value ? <Check className="size-3.5" /> : <Minus className="size-3.5" />}<span className="sr-only">{value ? "Inclus" : "Non inclus"}</span></span> : <span className={cn("font-medium", index === 1 ? "text-freelio-accent" : "text-freelio-muted")}>{value}</span>}</div>)}</div>)}
          </div>
        </SectionReveal>

        <SectionReveal className="mt-10 grid gap-4 lg:hidden" delay={0.04}>
          {pricingPlans.map((plan) => <MobilePricingCard key={plan.name} plan={plan} />)}
        </SectionReveal>

        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t border-freelio-line pt-6 text-xs text-freelio-muted">
          {["Données hébergées en France", "Sans engagement", "Mises à jour incluses", "Exports complets"].map((item) => <span key={item} className="flex items-center gap-2"><Check className="size-3.5 text-freelio-accent" />{item}</span>)}
        </div>
      </div>
    </section>
  )
}

function PricingHeader({ plan }: { plan: (typeof pricingPlans)[number] }) {
  return (
    <div className={cn("relative bg-white p-5 pt-10 text-center", plan.featured && "bg-freelio-accent-soft/60 shadow-[inset_0_3px_0_var(--color-freelio-accent)]")}>
      {plan.featured && <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-freelio-accent px-3 py-1 text-[9px] font-semibold uppercase text-white">Recommandé</span>}
      <h3 className="marketing-display text-xl font-semibold text-freelio-ink">{plan.name}</h3>
      <p className="mt-2 min-h-10 text-[11px] leading-5 text-freelio-muted">{plan.description}</p>
      <p className="marketing-display mt-5 text-[42px] font-semibold leading-none tabular-nums text-freelio-ink">{plan.price}</p>
      <p className="mt-1 min-h-8 text-[10px] text-freelio-muted">{plan.cadence}</p>
      <Link href={plan.href} className={cn("mt-5 flex h-11 items-center justify-center rounded-md text-xs font-semibold transition-[background-color,transform,box-shadow,border-color] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-freelio-accent focus-visible:ring-offset-2", plan.featured ? "bg-freelio-accent text-white hover:bg-freelio-accent-hover hover:shadow-[0_4px_8px_rgba(11,99,246,0.22)]" : "border border-freelio-line bg-white text-freelio-ink hover:border-freelio-line-strong hover:bg-freelio-surface-2")}>{plan.cta}</Link>
    </div>
  )
}

function MobilePricingCard({ plan }: { plan: (typeof pricingPlans)[number] }) {
  return (
    <article className={cn("rounded-lg border p-5", plan.featured ? "border-freelio-accent-line bg-freelio-accent-soft" : "border-freelio-line bg-white")}>
      <div className="flex items-start justify-between gap-4"><div><p className="marketing-display text-2xl font-semibold text-freelio-ink">{plan.name}</p><p className="mt-2 text-sm leading-6 text-freelio-muted">{plan.description}</p></div>{plan.featured && <span className="rounded-full bg-freelio-accent px-2.5 py-1 text-[9px] font-semibold text-white">CHOISI</span>}</div>
      <div className="mt-6 border-y border-freelio-line py-4"><p className="marketing-display text-4xl font-semibold tabular-nums text-freelio-ink">{plan.price}</p><p className="mt-1 text-[10px] text-freelio-muted">{plan.cadence}</p></div>
      <div className="mt-5 space-y-3">{plan.features.map((feature) => <p key={feature} className="flex items-center gap-2 text-sm text-freelio-ink"><Check className="size-3.5 text-freelio-accent" />{feature}</p>)}</div>
      <Link href={plan.href} className={cn("mt-6 flex h-11 items-center justify-center rounded-md text-sm font-semibold transition-[background-color,transform,box-shadow,border-color] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-freelio-accent focus-visible:ring-offset-2", plan.featured ? "bg-freelio-accent text-white hover:bg-freelio-accent-hover hover:shadow-[0_4px_8px_rgba(11,99,246,0.22)]" : "border border-freelio-line bg-white text-freelio-ink hover:border-freelio-line-strong hover:bg-freelio-surface-2")}>{plan.cta}</Link>
    </article>
  )
}

function FAQSection({ compact = false }: { compact?: boolean }) {
  const items = compact ? faqs.slice(0, 4) : faqs
  return (
    <section id="questions" className="scroll-mt-20 border-t border-freelio-line bg-white py-20 sm:py-28">
      <SectionReveal className={cn(shell, "grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16")}>
        <div><p className="marketing-kicker">Questions utiles</p><h2 className="marketing-display mt-5 max-w-xl text-[42px] font-semibold leading-[1.02] text-freelio-ink sm:text-[56px]">Savoir exactement ce que Freelio fait.</h2><p className="mt-5 max-w-md text-sm leading-6 text-freelio-muted">Les limites du produit comptent autant que ses fonctions. La réponse la plus sensible est ouverte d’emblée.</p>{compact && <div className="mt-8"><SecondaryLink href="/faq">Toutes les réponses</SecondaryLink></div>}</div>
        <div className="border-t border-freelio-line">
          {items.map((item, index) => <details key={item.question} name="freelio-faq" open={index === 0} className="marketing-faq group border-b border-freelio-line"><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 rounded-md px-2 text-base font-semibold text-freelio-ink transition-colors hover:bg-freelio-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-freelio-accent sm:px-4 sm:text-lg"><span>{item.question}</span><ChevronRight aria-hidden className="size-4 shrink-0 text-freelio-muted transition-transform group-open:rotate-90" /></summary><div className="marketing-faq-content"><p className="max-w-2xl px-2 pb-5 pt-1 text-sm leading-7 text-freelio-muted sm:px-4">{item.answer}</p></div></details>)}
        </div>
      </SectionReveal>
    </section>
  )
}

function FinalCTA() {
  const steps = [
    { icon: BadgeCheck, label: "Client ajouté", detail: "Atelier Rivet · Informations vérifiées", value: "Terminé", done: true },
    { icon: FileCheck2, label: "Devis accepté", detail: "DEV-2026-024 · 6 000 € HT", value: "Signé", done: true },
    { icon: ReceiptText, label: "Facture Factur-X", detail: "FAC-2026-041 · Prête à émettre", value: "À envoyer", done: false },
  ]

  return (
    <section className="bg-white pb-20 sm:pb-28">
      <div className={shell}>
        <SectionReveal className="overflow-hidden rounded-freelio-frame border border-freelio-line-strong bg-white shadow-[0_12px_28px_rgba(16,24,40,0.09)]">
          <div className="grid lg:grid-cols-[0.88fr_1.12fr]">
            <div className="relative overflow-hidden bg-freelio-accent px-6 py-10 text-white sm:px-10 sm:py-12 lg:px-12 lg:py-14">
              <div aria-hidden className="absolute inset-x-0 top-8 border-t border-white/15" />
              <div className="relative flex items-center gap-2 text-[10px] font-semibold uppercase text-white/70"><span className="size-1.5 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.14)]" />Alpha privée · Accès ouvert</div>
              <h2 className="marketing-display relative mt-7 max-w-xl text-[42px] font-semibold leading-[1.02] sm:text-[54px]">Commencez avec une mission réelle.</h2>
              <p className="relative mt-5 max-w-lg text-base leading-7 text-white/75">Importez un client, créez son devis et suivez le paiement dans un même fil. La valeur se voit dès le premier dossier.</p>
              <div className="relative mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href="/auth/login" className="group inline-flex h-12 items-center justify-center gap-3 rounded-md bg-white px-5 text-sm font-semibold text-freelio-ink shadow-[0_2px_6px_rgba(16,24,40,0.12)] transition-[background-color,transform,box-shadow] hover:bg-freelio-surface-2 hover:shadow-[0_4px_8px_rgba(16,24,40,0.14)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-freelio-accent">Créer mon espace<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></Link>
                <Link href="/fonctionnalites" className="inline-flex h-12 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Voir le produit<ChevronRight className="size-4" /></Link>
              </div>
              <p className="relative mt-8 flex items-center gap-2 text-xs text-white/65"><ShieldCheck className="size-4" />Sans carte bancaire · Données hébergées en France</p>
            </div>

            <div className="bg-freelio-surface-2 p-4 sm:p-7 lg:p-9">
              <div className="overflow-hidden rounded-xl border border-freelio-line-strong bg-white shadow-freelio-panel">
                <div className="flex items-center justify-between gap-4 border-b border-freelio-line px-4 py-3.5 sm:px-5">
                  <div className="min-w-0"><p className="text-[9px] font-semibold uppercase text-freelio-accent">Première mission</p><p className="mt-1 truncate text-sm font-semibold text-freelio-ink">Refonte du site · Atelier Rivet</p></div>
                  <span className="shrink-0 rounded-full bg-freelio-success-soft px-2.5 py-1 text-[9px] font-semibold text-freelio-success">Dossier actif</span>
                </div>
                <div className="p-3 sm:p-4">
                  {steps.map(({ icon: Icon, label, detail, value, done }, index) => (
                    <div key={label} className="group/step grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-freelio-surface-2">
                      <span className={cn("relative grid size-9 place-items-center rounded-lg", done ? "bg-freelio-success-soft text-freelio-success" : "bg-freelio-accent-soft text-freelio-accent")}><Icon className="size-4" />{index < steps.length - 1 && <span aria-hidden className="absolute left-1/2 top-full h-3 w-px -translate-x-1/2 bg-freelio-line" />}</span>
                      <div className="min-w-0"><p className="text-sm font-semibold text-freelio-ink">{label}</p><p className="mt-1 truncate text-[10px] text-freelio-muted">{detail}</p></div>
                      <span className={cn("rounded-full px-2 py-1 text-[9px] font-semibold", done ? "bg-freelio-success-soft text-freelio-success" : "bg-freelio-accent text-white")}>{value}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 border-t border-freelio-line bg-freelio-surface-2">
                  {[["1", "dossier"], ["3", "pièces reliées"], ["0", "ressaisie"]].map(([value, label]) => <div key={label} className="px-3 py-3 text-center sm:px-4"><p className="marketing-display text-lg font-semibold tabular-nums text-freelio-ink">{value}</p><p className="mt-0.5 text-[8px] text-freelio-muted">{label}</p></div>)}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4 px-1 text-[10px] text-freelio-muted"><span>Prêt en quelques minutes</span><span className="flex items-center gap-1.5 font-medium text-freelio-ink"><span className="size-1.5 rounded-full bg-freelio-success" />Contexte conservé</span></div>
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  )
}

export function FeaturesMarketingPage() {
  return (
    <MarketingFrame>
      <PublicPageHero
        eyebrow="Produit"
        title="Un seul produit pour faire avancer toute la mission."
        text="Freelio relie les décisions commerciales, le travail livré et les documents financiers dans un même dossier vivant."
        icon={Target}
        variant="features"
        secondaryHref="#workflow"
        secondaryLabel="Explorer le parcours"
      />
      <WorkflowStory />
      <ValueSystem />
      <UseCases />
      <FinalCTA />
    </MarketingFrame>
  )
}

function UseCases() {
  const cases = [
    { number: "01", title: "Consultant", copy: "Proposition, contrat, jalons et relances partagent le même contexte client.", signal: "2 900 € à sécuriser", icon: Target },
    { number: "02", title: "Créatif indépendant", copy: "Phases, validations et livrables deviennent des lignes de facturation sans ressaisie.", signal: "18h45 suivies", icon: FileText },
    { number: "03", title: "Développeur freelance", copy: "Temps, recette, anomalies et échéances restent visibles jusqu’au paiement.", signal: "6h20 à facturer", icon: Gauge },
  ]
  return (
    <section className="border-t border-freelio-line bg-white py-20 sm:py-28">
      <div className={cn(shell, "grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20")}>
        <div className="lg:sticky lg:top-28 lg:self-start"><p className="marketing-kicker">Selon votre métier</p><h2 className="marketing-display mt-5 text-[42px] font-bold leading-[1.02] text-freelio-ink sm:text-[56px]">Le même fil. Des rythmes différents.</h2><p className="mt-5 max-w-lg text-base leading-7 text-freelio-muted">La structure reste commune, mais les décisions utiles changent selon ce que vous livrez.</p></div>
        <div className="border-t border-freelio-line">
          {cases.map(({ number, title, copy, signal, icon: Icon }) => (
            <article key={title} className="grid gap-5 border-b border-freelio-line py-7 sm:grid-cols-[44px_1fr_auto] sm:items-center">
              <span className="grid size-11 place-items-center rounded-md bg-freelio-accent-soft text-freelio-accent"><Icon className="size-4" /></span>
              <div><p className="font-mono text-[9px] text-freelio-accent">{number}</p><h3 className="marketing-display mt-2 text-2xl font-bold text-freelio-ink">{title}</h3><p className="mt-2 max-w-xl text-sm leading-6 text-freelio-muted">{copy}</p></div>
              <span className="w-fit rounded-md border border-freelio-line bg-freelio-surface-2 px-3 py-2 font-mono text-[10px] font-semibold text-freelio-ink">{signal}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export function PricingMarketingPage() {
  return (
    <MarketingFrame>
      <PublicPageHero
        eyebrow="Tarifs"
        title="Un prix clair pour remplacer une pile d’outils."
        text="L’alpha est gratuite. Les offres suivantes montrent clairement le périmètre prévu, sans frais cachés ni engagement."
        icon={Euro}
        variant="pricing"
        secondaryHref="#tarifs"
        secondaryLabel="Comparer les offres"
      />
      <PricingSection />
      <PricingComparison />
      <FAQSection compact />
      <FinalCTA />
    </MarketingFrame>
  )
}

function PricingComparison() {
  const options = [
    { name: "Tableur + PDF", cost: "Faible au départ", friction: "Ressaisies, suivi manuel, contexte dispersé", fit: "Activité ponctuelle" },
    { name: "Facturation seule", cost: "8 à 25 € / mois", friction: "Document efficace, projet et relance séparés", fit: "Besoin documentaire" },
    { name: "Freelio", cost: "19 € / mois HT", friction: "Client, mission, temps, facture et paiement reliés", fit: "Activité à piloter" },
  ]
  return (
    <section className="border-t border-freelio-line bg-white py-20 sm:py-28">
      <div className={shell}>
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end"><div className="lg:col-span-7"><p className="marketing-kicker">Comparaison honnête</p><h2 className="marketing-display mt-5 text-[42px] font-bold leading-[1.02] text-freelio-ink sm:text-[56px]">Le prix doit enlever une pile, pas ajouter une ligne.</h2></div><p className="max-w-lg text-base leading-7 text-freelio-muted lg:col-span-5 lg:justify-self-end">Le bon choix dépend moins du nombre de fonctions que de la continuité dont votre activité a besoin.</p></div>
        <div className="mt-12 overflow-x-auto rounded-lg border border-freelio-line">
          <div className="min-w-[760px]"><div className="grid grid-cols-[1fr_0.75fr_1.5fr_0.9fr] bg-freelio-surface-2 px-5 py-3 text-[9px] font-semibold uppercase text-freelio-muted"><span>Approche</span><span>Coût</span><span>Limite principale</span><span>Adapté à</span></div>{options.map((option, index) => <div key={option.name} className={cn("grid grid-cols-[1fr_0.75fr_1.5fr_0.9fr] items-center border-t border-freelio-line px-5 py-5 text-sm", index === 2 && "bg-freelio-accent-soft")}><span className={cn("font-semibold", index === 2 ? "text-freelio-accent" : "text-freelio-ink")}>{option.name}</span><span className="font-mono text-xs text-freelio-ink">{option.cost}</span><span className="text-freelio-muted">{option.friction}</span><span className="text-freelio-muted">{option.fit}</span></div>)}</div>
        </div>
      </div>
    </section>
  )
}

export function ComplianceMarketingPage() {
  return (
    <MarketingFrame>
      <PublicPageHero
        eyebrow="Factur-X & conformité"
        title="Préparez 2026 avec des documents déjà propres."
        text="Freelio structure le PDF, les données, les mentions et les preuves. La transmission réglementaire reste confiée à votre plateforme agréée."
        icon={ShieldCheck}
        variant="compliance"
        secondaryHref="#conformite"
        secondaryLabel="Voir le périmètre"
      />
      <ComplianceSection />
      <ComplianceDetails />
      <FAQSection compact />
      <FinalCTA />
    </MarketingFrame>
  )
}

function ComplianceDetails() {
  const items = [
    [ReceiptText, "Factur-X", "PDF lisible et données structurées issus du même contexte.", "PDF + XML"],
    [Gauge, "TVA", "Paramètres, seuils indicatifs et mentions restent à portée de contrôle.", "Suivi continu"],
    [BookOpenCheck, "Livre de recettes", "Encaissements et exports de vérification restent rapprochés.", "Traçable"],
    [CloudDownload, "Portabilité", "Données, pièces et preuves restent récupérables à tout moment.", "Export complet"],
  ] as const
  return (
    <section className="bg-freelio-canvas py-20 sm:py-28"><div className={shell}><div className="grid gap-8 lg:grid-cols-12 lg:items-end"><div className="lg:col-span-7"><p className="marketing-kicker">Le périmètre</p><h2 className="marketing-display mt-5 text-[42px] font-bold leading-[1.02] text-freelio-ink sm:text-[58px]">Un socle clair pour les documents qui comptent.</h2></div><p className="max-w-lg text-base leading-7 text-freelio-muted lg:col-span-5 lg:justify-self-end">Chaque brique répond à une responsabilité précise. Freelio explicite ce qu’il prépare et ce qui reste confié à vos partenaires.</p></div><div className="mt-14 border-t border-freelio-line">{items.map(([Icon, title, text, status], index) => { const ItemIcon = Icon as LucideIcon; return <article key={title} className="grid gap-5 border-b border-freelio-line py-6 sm:grid-cols-[48px_180px_1fr_auto] sm:items-center"><span className="grid size-12 place-items-center rounded-md bg-white text-freelio-accent shadow-freelio-float"><ItemIcon className="size-5" /></span><div><p className="font-mono text-[9px] text-freelio-accent">0{index + 1}</p><h3 className="marketing-display mt-1 text-xl font-bold text-freelio-ink">{title}</h3></div><p className="max-w-2xl text-sm leading-6 text-freelio-muted">{text}</p><span className="w-fit rounded-md bg-freelio-success-soft px-3 py-2 text-[9px] font-semibold text-freelio-success">{status}</span></article> })}</div></div></section>
  )
}

export function FaqMarketingPage() {
  return (
    <MarketingFrame>
      <PublicPageHero
        eyebrow="Centre de réponses"
        title="Des réponses nettes avant de changer votre façon de travailler."
        text="Freelio documente son rôle, ses limites et la manière dont vos données restent reliées, exportables et compréhensibles."
        icon={CircleHelp}
        variant="faq"
        secondaryHref="#questions"
        secondaryLabel="Parcourir les réponses"
      />
      <FAQSection />
      <FinalCTA />
    </MarketingFrame>
  )
}

function PublicPageHero({ eyebrow, title, text, icon: Icon, variant, secondaryHref, secondaryLabel }: { eyebrow: string; title: string; text: string; icon: LucideIcon; variant: "features" | "pricing" | "compliance" | "faq"; secondaryHref: string; secondaryLabel: string }) {
  return (
    <section className="relative overflow-hidden border-b border-freelio-line bg-white py-14 sm:py-20 lg:py-24">
      <div aria-hidden className="marketing-dot-grid absolute inset-0 opacity-45" />
      <div className={cn(shell, "relative z-10")}>
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
          <HeroIntroMotion className="lg:col-span-8"><div className="flex items-center gap-2 text-xs font-semibold text-freelio-accent"><span className="grid size-8 place-items-center rounded-md bg-freelio-accent-soft"><Icon className="size-4" /></span>{eyebrow}</div><h1 className="marketing-display mt-6 max-w-5xl text-[46px] font-bold leading-[0.98] text-freelio-ink sm:text-[66px]">{title}</h1></HeroIntroMotion>
          <HeroIntroMotion className="lg:col-span-4" delay={0.14}><p className="max-w-lg text-base leading-7 text-freelio-muted">{text}</p><div className="mt-7 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row"><PrimaryLink href="/auth/login">Essayer gratuitement</PrimaryLink><SecondaryLink href={secondaryHref}>{secondaryLabel}</SecondaryLink></div><p className="mt-4 flex items-center gap-2 text-xs text-freelio-muted"><ShieldCheck className="size-4 text-freelio-success" />Sans carte bancaire pendant l’alpha.</p></HeroIntroMotion>
        </div>
        <div className="mt-8 sm:mt-12"><RouteHeroVisual variant={variant} /></div>
      </div>
    </section>
  )
}

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="group inline-flex h-12 items-center justify-center gap-3 rounded-md bg-freelio-accent px-5 text-sm font-semibold text-white shadow-[0_2px_6px_rgba(11,99,246,0.2)] transition-[background-color,transform,box-shadow] hover:bg-freelio-accent-hover hover:shadow-[0_4px_8px_rgba(11,99,246,0.22)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-freelio-accent focus-visible:ring-offset-2">{children}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></Link>
}

function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="group inline-flex h-12 items-center justify-center gap-3 rounded-md border border-freelio-line bg-white px-5 text-sm font-semibold text-freelio-ink transition-[background-color,border-color,transform] hover:border-freelio-line-strong hover:bg-freelio-surface-2 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-freelio-accent">{children}<ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" /></Link>
}

function Footer() {
  return (
    <footer className="border-t border-freelio-line bg-freelio-surface-2 py-10">
      <div className={cn(shell, "grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end")}>
        <div><div className="flex items-center gap-2.5"><LogoMark /><span className="marketing-display text-lg font-bold text-freelio-ink">Freelio</span></div><p className="mt-4 max-w-lg text-sm leading-6 text-freelio-muted">Cockpit de gestion pour indépendants français. Freelio structure vos opérations sans remplacer votre expert-comptable ni votre plateforme agréée.</p></div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-freelio-muted">{navItems.map((item) => <Link key={item.href} href={item.href} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 transition-colors hover:text-freelio-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-freelio-accent">{item.label}</Link>)}<Link href="/auth/login" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 transition-colors hover:text-freelio-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-freelio-accent">Connexion</Link></div>
      </div>
      <div className={cn(shell, "mt-8 flex flex-col gap-3 border-t border-freelio-line pt-5 text-xs text-freelio-muted sm:flex-row sm:items-center sm:justify-between")}><span>© 2026 Freelio. Produit en phase alpha.</span><span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-freelio-success shadow-[0_0_0_4px_var(--color-freelio-success-soft)]" />Alpha privée en cours</span></div>
    </footer>
  )
}

function LogoMark() {
  return (
    <span aria-hidden className="relative block size-8 shrink-0">
      <span className="absolute left-[14%] top-[8%] h-[32%] w-[62%] skew-y-[-24deg] rounded-[2px] bg-freelio-accent" />
      <span className="absolute left-[14%] top-[36%] h-[28%] w-[48%] skew-y-[-24deg] rounded-[2px] bg-freelio-accent" />
      <span className="absolute bottom-[5%] left-[14%] h-[44%] w-[24%] skew-y-[-24deg] rounded-[2px] bg-freelio-accent" />
    </span>
  )
}
