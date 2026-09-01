import { z } from "zod"

export const CRM_OBJECT_TYPES = ["CLIENT", "CONTACT", "OPPORTUNITY", "PROJECT", "TICKET", "EQUIPMENT"] as const
export type CrmObjectType = (typeof CRM_OBJECT_TYPES)[number]

export const CRM_PROPERTY_TYPES = ["TEXT", "NUMBER", "CURRENCY", "DATE", "BOOLEAN", "SELECT", "MULTI_SELECT"] as const
export type CrmPropertyType = (typeof CRM_PROPERTY_TYPES)[number]

export const crmObjectTypeSchema = z.enum(CRM_OBJECT_TYPES)
export const crmPropertyTypeSchema = z.enum(CRM_PROPERTY_TYPES)

export const crmPropertyOptionSchema = z.object({
  value: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/, "Valeur d’option invalide"),
  label: z.string().trim().min(1).max(120),
})

export const crmPropertyDefinitionSchema = z.object({
  objectType: crmObjectTypeSchema,
  key: z.string().trim().min(2).max(80).regex(/^[a-z][a-z0-9_]*$/, "La clé doit utiliser des minuscules, chiffres et underscores"),
  label: z.string().trim().min(2, "Le libellé est requis").max(120),
  type: crmPropertyTypeSchema,
  groupName: z.string().trim().min(2).max(120).default("Informations complémentaires"),
  description: z.string().trim().max(500).optional().nullable(),
  options: z.array(crmPropertyOptionSchema).max(50).default([]),
  required: z.boolean().default(false),
}).superRefine((value, context) => {
  if (["SELECT", "MULTI_SELECT"].includes(value.type) && value.options.length < 1) {
    context.addIssue({ code: "custom", path: ["options"], message: "Ajoutez au moins une option" })
  }
  const optionValues = value.options.map((option) => option.value)
  if (new Set(optionValues).size !== optionValues.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "Chaque option doit avoir une valeur unique" })
  }
})

export type CrmPropertyDefinitionInput = z.infer<typeof crmPropertyDefinitionSchema>

export type CrmPropertyDefinitionLike = {
  type: string
  required: boolean
  options?: unknown
}

export function crmPropertyOptions(value: unknown) {
  const parsed = z.array(crmPropertyOptionSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

function emptyValue(value: unknown) {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0)
}

export function parseCrmPropertyValue(definition: CrmPropertyDefinitionLike, value: unknown): string | number | boolean | string[] | null {
  if (emptyValue(value)) {
    if (definition.required) throw new Error("Cette propriété est obligatoire")
    return null
  }

  if (definition.type === "TEXT") {
    const parsed = z.string().trim().min(1).max(5_000).parse(value)
    return parsed
  }
  if (definition.type === "NUMBER" || definition.type === "CURRENCY") {
    const normalized = typeof value === "string" ? value.replace(",", ".").trim() : value
    const parsed = z.coerce.number().finite().min(-1_000_000_000).max(1_000_000_000).parse(normalized)
    return parsed
  }
  if (definition.type === "DATE") {
    const parsed = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide").parse(value)
    const date = new Date(`${parsed}T12:00:00.000Z`)
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== parsed) throw new Error("Date invalide")
    return parsed
  }
  if (definition.type === "BOOLEAN") {
    if (value === true || value === "true") return true
    if (value === false || value === "false") return false
    throw new Error("Valeur oui/non invalide")
  }

  const options = crmPropertyOptions(definition.options)
  const allowedValues = new Set(options.map((option) => option.value))
  if (definition.type === "SELECT") {
    const parsed = z.string().parse(value)
    if (!allowedValues.has(parsed)) throw new Error("Option invalide")
    return parsed
  }
  if (definition.type === "MULTI_SELECT") {
    const parsed = z.array(z.string()).max(50).parse(value)
    const unique = [...new Set(parsed)]
    if (unique.some((item) => !allowedValues.has(item))) throw new Error("Option invalide")
    return unique
  }
  throw new Error("Type de propriété non pris en charge")
}

export function crmPropertyKeyFromLabel(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80)
}

export const CRM_PROPERTY_PRESETS: Record<CrmObjectType, CrmPropertyDefinitionInput[]> = {
  CLIENT: [
    { objectType: "CLIENT", key: "source_acquisition", label: "Source d’acquisition", type: "SELECT", groupName: "Qualification", description: "Origine commerciale principale du client.", required: false, options: [{ value: "recommandation", label: "Recommandation" }, { value: "site_web", label: "Site web" }, { value: "magasin", label: "Visite magasin" }, { value: "salon", label: "Salon" }, { value: "partenaire", label: "Partenaire" }] },
    { objectType: "CLIENT", key: "type_bassin", label: "Type de bassin", type: "SELECT", groupName: "Projet piscine", description: null, required: false, options: [{ value: "enterre", label: "Enterré" }, { value: "semi_enterre", label: "Semi-enterré" }, { value: "hors_sol", label: "Hors-sol" }, { value: "renovation", label: "Rénovation" }] },
    { objectType: "CLIENT", key: "budget_estime", label: "Budget estimé", type: "CURRENCY", groupName: "Qualification", description: "Budget indicatif exprimé en euros.", required: false, options: [] },
    { objectType: "CLIENT", key: "date_derniere_visite", label: "Dernière visite", type: "DATE", groupName: "Suivi terrain", description: null, required: false, options: [] },
  ],
  CONTACT: [
    { objectType: "CONTACT", key: "canal_prefere", label: "Canal préféré", type: "SELECT", groupName: "Communication", description: null, required: false, options: [{ value: "email", label: "E-mail" }, { value: "telephone", label: "Téléphone" }, { value: "sms", label: "SMS" }] },
    { objectType: "CONTACT", key: "decisionnaire", label: "Décisionnaire", type: "BOOLEAN", groupName: "Qualification", description: null, required: false, options: [] },
  ],
  OPPORTUNITY: [
    { objectType: "OPPORTUNITY", key: "type_projet", label: "Type de projet", type: "SELECT", groupName: "Projet piscine", description: null, required: false, options: [{ value: "construction", label: "Construction" }, { value: "renovation", label: "Rénovation" }, { value: "equipement", label: "Équipement" }, { value: "entretien", label: "Entretien" }] },
    { objectType: "OPPORTUNITY", key: "dimensions_bassin", label: "Dimensions du bassin", type: "TEXT", groupName: "Projet piscine", description: "Ex. 8 × 4 m, profondeur 1,50 m.", required: false, options: [] },
    { objectType: "OPPORTUNITY", key: "contraintes_acces", label: "Contraintes d’accès", type: "TEXT", groupName: "Étude technique", description: "Portail, grutage, voisinage ou accès engins.", required: false, options: [] },
  ],
  PROJECT: [
    { objectType: "PROJECT", key: "conducteur_travaux_externe", label: "Interlocuteur travaux externe", type: "TEXT", groupName: "Chantier", description: null, required: false, options: [] },
    { objectType: "PROJECT", key: "autorisation_urbanisme", label: "Autorisation d’urbanisme obtenue", type: "BOOLEAN", groupName: "Chantier", description: null, required: false, options: [] },
  ],
  TICKET: [
    { objectType: "TICKET", key: "cause_probable", label: "Cause probable", type: "TEXT", groupName: "Diagnostic", description: null, required: false, options: [] },
    { objectType: "TICKET", key: "prise_en_charge_garantie", label: "Prise en charge garantie", type: "BOOLEAN", groupName: "Diagnostic", description: null, required: false, options: [] },
  ],
  EQUIPMENT: [
    { objectType: "EQUIPMENT", key: "date_mise_en_service", label: "Mise en service", type: "DATE", groupName: "Parc installé", description: null, required: false, options: [] },
    { objectType: "EQUIPMENT", key: "contrat_fabricant", label: "Contrat fabricant", type: "TEXT", groupName: "Parc installé", description: null, required: false, options: [] },
  ],
}
