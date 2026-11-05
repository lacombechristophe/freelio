import { CalendarDays, Landmark, Mail, PackageCheck, Target, Users } from "lucide-react"

import { SectionReveal } from "@/components/marketing/marketing-motion"

const capabilities = [
  {
    icon: Mail,
    label: "Communications",
    title: "Les échanges restent dans le dossier client.",
    text: "Retrouvez les conversations, préparez vos réponses et joignez les documents du client. Les brouillons personnels, la signature et la programmation d’envoi accompagnent la rédaction.",
  },
  {
    icon: Target,
    label: "Marketing et automatisations",
    title: "Une audience vérifiée avant la relance.",
    text: "Qualifiez les prospects, composez des segments et préparez vos campagnes. Les séquences suivent une cadence définie ; leur journal permet de vérifier les actions et de reprendre les situations incertaines sans renvoi automatique.",
  },
  {
    icon: CalendarDays,
    label: "Portail client",
    title: "Le client retrouve ses documents et ses échanges.",
    text: "Un lien temporaire donne accès à son dossier : documents, avancement, messages et demandes de rendez-vous avec l’équipe. Le portail complète le suivi des chantiers, du SAV et de l’entretien.",
  },
  {
    icon: PackageCheck,
    label: "Stocks et achats",
    title: "Le matériel suit le chantier.",
    text: "Reliez catalogue, fournisseurs et commandes d’achat. Suivez les réceptions, les retours et les stocks par dépôt, puis réservez ou transférez le matériel jusqu’à son utilisation en intervention.",
  },
  {
    icon: Landmark,
    label: "Finance et organisation",
    title: "Les heures et les règlements rejoignent la facture.",
    text: "Suivez les tâches, les temps facturables et les dépenses du chantier. Préparez acomptes, soldes et récurrences ; importez un relevé bancaire CSV pour rapprocher les règlements. Les documents émis conservent leur archive d’origine lorsqu’elle a été enregistrée.",
  },
  {
    icon: Users,
    label: "Travail en équipe",
    title: "Chaque métier dispose de son périmètre.",
    text: "Répartissez le travail entre agences et membres de l’équipe. Les droits distinguent commerce, Finance, Opérations et Service ; les boîtes privées ou partagées encadrent l’accès aux échanges. Les actions sensibles gardent une trace dans le journal d’audit.",
  },
]

export function MarketingCapabilities() {
  return (
    <section aria-labelledby="quotidien-title" className="border-t border-freelio-line bg-white py-20 sm:py-28">
      <div className="mx-auto w-full max-w-[1380px] px-5 sm:px-8 lg:px-10">
        <SectionReveal className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="marketing-kicker">Au quotidien</p>
            <h2 id="quotidien-title" className="marketing-display mt-5 max-w-3xl text-[42px] font-semibold leading-[1.02] text-freelio-ink sm:text-[60px]">Les outils du quotidien, dans le même dossier.</h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-freelio-muted lg:col-span-5 lg:justify-self-end">Au-delà des devis et des chantiers, Freelio relie aussi les échanges, les relances, les achats et le travail de l’équipe.</p>
        </SectionReveal>

        <SectionReveal className="mt-14 grid gap-px overflow-hidden rounded-freelio-frame border border-freelio-line bg-freelio-line md:grid-cols-2 lg:grid-cols-3" delay={0.06}>
          {capabilities.map(({ icon: Icon, label, title, text }) => (
            <article key={label} className="min-w-0 bg-white p-6 sm:p-8">
              <div className="flex items-center gap-2">
                <Icon aria-hidden className="size-4 shrink-0 text-freelio-accent" />
                <p className="text-[10px] font-semibold uppercase text-freelio-muted">{label}</p>
              </div>
              <h3 className="marketing-display mt-5 text-2xl font-semibold leading-tight text-freelio-ink sm:text-3xl">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-freelio-muted">{text}</p>
            </article>
          ))}
        </SectionReveal>

        <p className="mt-6 max-w-3xl text-xs leading-5 text-freelio-muted">Les messageries, calendriers et envois automatiques nécessitent une configuration et les autorisations des comptes concernés. La prospection vérifie une preuve de consentement liée à l’adresse et prend en compte les retraits.</p>
      </div>
    </section>
  )
}
