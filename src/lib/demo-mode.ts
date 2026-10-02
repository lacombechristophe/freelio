// Enabled only by the isolated demo launcher, never inferred from development mode.
export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true"
export const isReadOnlyDemo = process.env.NEXT_PUBLIC_DEMO_READ_ONLY === "true"

export const DEMO_NOTICE = isReadOnlyDemo ? "Démonstration en lecture seule — données fictives" : "Démonstration — données fictives"
export const DEMO_ACCOUNT_EMAIL = "direction@atelier-des-bassins.example.test"
export const DEMO_ENTRY_LABEL = isReadOnlyDemo ? "Ouvrir la démonstration" : "Essayer gratuitement"
export const DEMO_USAGE_NOTICE = isReadOnlyDemo
  ? "Cette instance de démonstration contient des données fictives et n’est pas ouverte à un usage commercial. N’y importez pas de données réelles."
  : "Cette instance locale contient des données fictives et n’est pas ouverte à un usage commercial. N’y importez pas de données réelles."

export const DEMO_QUOTE_LINES = [
  ["Terrassement", "2 000 €"],
  ["Structure & étanchéité", "2 800 €"],
  ["Filtration & pose", "2 000 €"],
] as const

export const DEMO_INVOICE_LINES = [
  ["Acompte chantier", "1 700 €"],
  ["Équipements", "2 900 €"],
  ["Pose", "2 200 €"],
] as const
