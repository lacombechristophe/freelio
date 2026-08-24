import Link from "next/link"
import {
  ArrowUpRight,
  BookOpenCheck,
  ChevronDown,
  CircleHelp,
  FileCheck2,
  Landmark,
  LifeBuoy,
  Mail,
  ReceiptText,
  Settings2,
  ShieldCheck,
} from "lucide-react"

import { PageHeader } from "@/components/shared/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const quickLinks = [
  { href: "/dashboard/settings", title: "Vérifier mes informations légales", detail: "Identité, SIRET, TVA et coordonnées bancaires", icon: Settings2 },
  { href: "/dashboard/factures", title: "Contrôler mes factures", detail: "Statuts, règlements, échéances et Factur-X", icon: ReceiptText },
  { href: "/dashboard/comptabilite", title: "Préparer mes données comptables", detail: "Livre des recettes, exports et repères financiers", icon: Landmark },
]

const topics = [
  {
    title: "Franchise en base de TVA",
    copy: "Le réglage TVA de votre espace détermine les taux et mentions proposés sur les documents. Vérifiez votre situation et vos seuils avec un professionnel compétent avant toute modification.",
    href: "/dashboard/settings",
    action: "Ouvrir la facturation",
  },
  {
    title: "Factures émises et historique",
    copy: "Une facture sortie du brouillon doit conserver sa chronologie. En cas d’erreur, utilisez le flux de correction adapté et conservez l’historique des opérations.",
    href: "/dashboard/factures",
    action: "Voir les factures",
  },
  {
    title: "Factur-X et facturation électronique",
    copy: "Le CRM prépare des documents hybrides Factur-X. La transmission réglementaire dépend de la plateforme agréée choisie par votre entreprise.",
    href: "/conformite",
    action: "Lire la page conformité",
  },
  {
    title: "Exports et sauvegardes",
    copy: "Exportez régulièrement vos données et pièces pour conserver une copie exploitable hors du CRM et faciliter les échanges avec votre comptable.",
    href: "/dashboard/settings",
    action: "Gérer mes sauvegardes",
  },
]

export default function HelpPage() {
  const supportEmail = process.env.SUPPORT_EMAIL?.trim()
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Ressources"
        title="Aide & conformité"
        description="Les repères utiles pour configurer le CRM, contrôler vos documents et préparer vos données."
        actions={supportEmail ? <a href={`mailto:${supportEmail}`} className={cn(buttonVariants({ variant: "outline" }), "gap-2")}><Mail />Contacter le support</a> : undefined}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <Card>
          <CardHeader className="border-b border-border pb-5">
            <CardTitle className="flex items-center gap-2"><LifeBuoy className="size-4 text-primary" />Actions courantes</CardTitle>
            <CardDescription>Accédez directement aux réglages et contrôles les plus demandés.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border px-0">
            {quickLinks.map(({ href, title, detail, icon: Icon }) => (
              <Link key={href} href={href} className="group flex min-h-20 items-center gap-4 px-5 transition-colors hover:bg-muted/45">
                <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-accent text-primary"><Icon className="size-4" /></span>
                <span className="min-w-0"><span className="block text-sm font-semibold text-foreground">{title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span></span>
                <ArrowUpRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-foreground text-background">
          <CardHeader>
            <span className="grid size-10 place-items-center rounded-[10px] bg-background/10 text-background"><CircleHelp className="size-5" /></span>
            <CardTitle className="mt-3 text-background">Une question précise ?</CardTitle>
            <CardDescription className="text-background/65">Décrivez le document, le statut concerné et le résultat attendu. Le support pourra vous répondre plus vite.</CardDescription>
          </CardHeader>
          <CardContent className="mt-auto space-y-3">
            {supportEmail ? <a href={`mailto:${supportEmail}`} className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full gap-2 bg-white text-[#101828] hover:bg-white/90")}><Mail />{supportEmail}</a> : <Link href="/dashboard/settings" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full gap-2 bg-white text-[#101828] hover:bg-white/90")}><Settings2 />Vérifier la configuration</Link>}
            <p className="text-center text-xs text-background/55">Canal de support défini par l’administrateur</p>
          </CardContent>
        </Card>
      </div>

      <section>
        <div className="mb-5 max-w-2xl">
          <p className="text-[11px] font-semibold uppercase text-primary">Repères essentiels</p>
          <h2 className="mt-2 font-heading text-2xl font-semibold">Comprendre les réglages sensibles</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Le CRM structure vos données, mais ne remplace pas le conseil d’un expert-comptable ou d’un juriste.</p>
        </div>

        <Card>
          <CardContent className="divide-y divide-border px-0">
            {topics.map((topic, index) => (
              <details key={topic.title} className="group">
                <summary className="flex min-h-16 cursor-pointer list-none items-center gap-4 px-5 py-4 text-sm font-semibold transition-colors hover:bg-muted/45">
                  <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                  <span>{topic.title}</span>
                  <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="border-t border-border bg-muted/30 px-5 py-5 sm:pl-14">
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{topic.copy}</p>
                  <Link href={topic.href} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">{topic.action}<ArrowUpRight className="size-3.5" /></Link>
                </div>
              </details>
            ))}
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          [ShieldCheck, "Données exportables", "Vos données métier et pièces restent récupérables."],
          [FileCheck2, "Documents reliés", "Les états et versions restent rattachés au bon dossier."],
          [BookOpenCheck, "Informations générales", "Les repères affichés doivent être validés selon votre situation."],
        ].map(([Icon, title, copy]) => {
          const ItemIcon = Icon as typeof ShieldCheck
          return <div key={title as string} className="flex gap-3 border-t border-border py-4"><ItemIcon className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-sm font-semibold">{title as string}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{copy as string}</p></div></div>
        })}
      </div>
    </div>
  )
}
