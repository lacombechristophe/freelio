import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = { title: "Politique de confidentialité" }

const sections = [
  ["Rôles et périmètre", "Pour les données du compte et de la souscription, l’éditeur agit comme responsable de traitement. Pour les données métier importées par une entreprise cliente, celle-ci détermine les finalités et l’éditeur agit comme sous-traitant selon le contrat applicable."],
  ["Données traitées", "Identité et coordonnées professionnelles, authentification et sécurité, informations de facturation SaaS, journaux techniques, ainsi que les données métier saisies ou importées par l’organisation cliente."],
  ["Finalités et bases", "Fourniture et sécurisation du service, gestion des comptes et abonnements, assistance, obligations comptables et amélioration mesurée du produit. Les communications marketing reposent sur le consentement ou l’intérêt légitime lorsque la réglementation l’autorise."],
  ["Destinataires et sous-traitants", "Les accès sont limités aux personnes habilitées et aux prestataires nécessaires à l’hébergement, l’e-mail, le stockage, l’observabilité et le paiement. La liste contractuelle des sous-traitants et leurs localisations doit être tenue à jour avant l’ouverture commerciale."],
  ["Conservation et sécurité", "Les durées dépendent de la nature des données et des obligations applicables. Le produit fournit isolation par organisation, contrôle des rôles, MFA, chiffrement de champs sensibles, journaux d’audit, export et révocation des sessions."],
  ["Vos droits", "Vous pouvez demander accès, rectification, effacement, limitation, opposition ou portabilité selon les conditions légales. Pour les données gérées par une entreprise cliente, adressez-vous d’abord à cette entreprise, qui demeure votre interlocuteur principal."],
]

export default function PrivacyPage() {
  return <main className="min-h-screen bg-[#f7f9fc] px-5 py-16"><article className="mx-auto max-w-3xl rounded-2xl border bg-white p-7 shadow-sm sm:p-10"><p className="text-xs font-semibold text-primary">Protection des données</p><h1 className="mt-3 text-3xl font-semibold">Politique de confidentialité</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Version du 31 août 2026. Cette page décrit le périmètre technique actuel ; l’identité légale de l’éditeur, le contact données personnelles, les durées détaillées et la liste des sous-traitants doivent être complétés et validés avant ouverture commerciale.</p><div className="mt-8 space-y-7 text-sm leading-7">{sections.map(([title, body]) => <section key={title}><h2 className="font-semibold">{title}</h2><p className="mt-2 text-muted-foreground">{body}</p></section>)}</div><div className="mt-9 flex flex-wrap gap-4 border-t pt-5"><Link href="/conditions" className="text-sm font-semibold text-primary hover:underline">Conditions d’utilisation</Link><Link href="/conformite" className="text-sm font-semibold text-primary hover:underline">Conformité produit</Link></div></article></main>
}
