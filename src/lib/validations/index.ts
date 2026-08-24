import { z } from "zod"

const EntityIdSchema = z.string().min(1, "Identifiant requis")

export const PaymentTermsSchema = z.enum([
  "UPON_RECEIPT",
  "15_DAYS",
  "30_DAYS",
  "45_DAYS",
])

export const PdfTemplateSchema = z.enum(["MINIMAL", "PROFESSIONAL", "MODERN"])

const optionalText = z.string().trim().default("")

const optionalSiret = z
  .string()
  .trim()
  .default("")
  .transform((value) => value.replace(/\s+/g, ""))
  .refine(
    (value) => value === "" || /^\d{14}$/.test(value),
    "Le SIRET doit contenir 14 chiffres"
  )

const optionalNumericRate = z
  .string()
  .trim()
  .default("12.25")
  .refine((value) => {
    if (value === "") return true
    const rate = Number(value.replace(",", "."))
    return Number.isFinite(rate) && rate >= 0 && rate <= 100
  }, "Le taux doit être compris entre 0 et 100")

const optionalMinLength = (min: number, message: string) =>
  z
    .string()
    .trim()
    .default("")
    .refine((value) => value === "" || value.length >= min, message)

export const OnboardingFormSchema = z.object({
  companyName: z.string().trim().min(2, "Le nom de l'entreprise est requis"),
  fullName: z.string().trim().min(2, "Le nom complet est requis"),
  siret: optionalSiret,
  address: z.string().trim().min(5, "L'adresse est requise"),
  email: z.string().trim().email("Email invalide"),
  phone: optionalText,
  isTvaApplicable: z.boolean().default(false),
  tvaNumber: optionalText,
  apeCode: optionalText,
  iban: optionalText,
  invoicePrefix: z.string().trim().min(1, "Le préfixe est requis").max(20),
  paymentTerms: PaymentTermsSchema,
  latePenaltyRate: optionalNumericRate,
  pdfTemplate: PdfTemplateSchema,
  firstClientName: optionalMinLength(
    2,
    "Le nom du premier client doit contenir au moins 2 caractères"
  ),
})

export type OnboardingFormInput = z.input<typeof OnboardingFormSchema>
export type OnboardingFormValues = z.infer<typeof OnboardingFormSchema>

export const ClientSchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  type: z.enum(["ENTERPRISE", "INDIVIDUAL", "ADMINISTRATION"]),
  siret: z.string().length(14, "Le SIRET doit contenir 14 chiffres").optional().or(z.literal("")),
  tvaNumber: z.string().optional().or(z.literal("")),
  address: z.string().min(5, "L'adresse est requise"),
})

export const ContactSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email("Email invalide").optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  role: z.string().trim().max(100).optional().or(z.literal("")),
  isPrimary: z.boolean().default(false),
})

export const ClientActivitySchema = z.object({
  type: z.enum(["NOTE", "EMAIL", "CALL", "MEETING"]),
  content: z.string().trim().min(2).max(5000),
  happenedAt: z.string().optional().or(z.literal("")),
})

export const ClientNextActionSchema = z.object({
  label: z.string().trim().max(180).optional().or(z.literal("")),
  date: z.string().optional().or(z.literal("")),
})

export const ProjectSchema = z.object({
  clientId: EntityIdSchema,
  name: z.string().min(3, "Le nom du projet est requis"),
  description: z.string().optional().or(z.literal("")),
  budgetCents: z.number().int().nonnegative(),
  status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
})

export const ProjectMilestoneSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
})

export const ProjectAcceptanceSchema = z.object({
  title: z.string().trim().min(2).max(220),
  dueDate: z.string().optional().or(z.literal("")),
})

const profileText = (max: number) => z.preprocess(
  (value) => value == null ? "" : value,
  z.string().trim().max(max),
)

const profileMeasurement = (max: number) => z.preprocess(
  (value) => value == null ? "" : value,
  z.union([z.literal(""), z.coerce.number().int().min(0).max(max)]),
)

export const ProjectTechnicalProfileSchema = z.object({
  surveyStatus: z.preprocess((value) => value ?? "DRAFT", z.enum(["DRAFT", "SURVEYED", "VALIDATED"])),
  surveyedAt: profileText(10),
  surveyedBy: profileText(160),
  poolShape: profileText(80),
  poolLengthMm: profileMeasurement(100_000),
  poolWidthMm: profileMeasurement(100_000),
  poolDepthMm: profileMeasurement(20_000),
  diagonal1Mm: profileMeasurement(150_000),
  diagonal2Mm: profileMeasurement(150_000),
  copingType: profileText(160),
  deckMaterial: profileText(160),
  accessWidthMm: profileMeasurement(20_000),
  powerSupply: profileText(160),
  obstacles: profileText(3_000),
  installationConstraints: profileText(3_000),
  recommendedProduct: profileText(250),
  coverModel: profileText(250),
  coverColor: profileText(120),
  measurementNotes: profileText(5_000),
  validationNotes: profileText(5_000),
})

export const QuoteLineSchema = z.object({
  label: z.string().min(1, "Libellé requis"),
  description: z.string().optional().or(z.literal("")),
  quantity: z.number().positive("La quantité doit être > 0"),
  unitPriceCents: z.number().int().nonnegative(),
  tvaRate: z.number().min(0).max(100),
})

export const QuoteSchema = z.object({
  clientId: EntityIdSchema,
  projectId: EntityIdSchema.optional().or(z.literal("")),
  object: z.string().min(3, "Objet requis"),
  validUntil: z.string().optional().or(z.literal("")),
  lines: z.array(QuoteLineSchema).min(1, "Au moins une ligne est requise"),
})

export const InvoiceLineSchema = QuoteLineSchema
export const InvoiceSchema = z.object({
  clientId: EntityIdSchema,
  projectId: EntityIdSchema.optional().or(z.literal("")),
  object: z.string().min(3),
  dueDate: z.string().min(1, "Date d'échéance requise"),
  type: z.enum(["STANDARD", "DEPOSIT", "CREDIT_NOTE"]).optional(),
  lines: z.array(InvoiceLineSchema).min(1, "Au moins une ligne est requise"),
})

export const ContractSchema = z.object({
  clientId: EntityIdSchema,
  title: z.string().min(3, "Titre requis"),
  content: z.string().min(10, "Contenu requis"),
  validFrom: z.string().optional().or(z.literal("")),
  validUntil: z.string().optional().or(z.literal("")),
})

export const ExpenseSchema = z.object({
  label: z.string().min(2, "Libellé requis"),
  provider: z.string().optional().or(z.literal("")),
  amountCents: z.number().int().nonnegative(),
  tvaCents: z.number().int().nonnegative().optional(),
  date: z.string().min(1, "Date requise"),
  category: z.string().min(1, "Catégorie requise"),
  clientId: EntityIdSchema.optional().or(z.literal("")),
  projectId: EntityIdSchema.optional().or(z.literal("")),
})

export const TimeEntrySchema = z.object({
  projectId: EntityIdSchema,
  durationSec: z.number().int().positive("Durée > 0 requise"),
  description: z.string().optional().or(z.literal("")),
  date: z.string().optional().or(z.literal("")),
  isBillable: z.boolean().optional(),
})

export const ServiceSchema = z.object({
  code: z.string().optional().or(z.literal("")),
  label: z.string().min(2, "Libellé requis"),
  description: z.string().optional().or(z.literal("")),
  priceCents: z.number().int().nonnegative(),
  unit: z.enum(["jour", "heure", "forfait", "mois"]),
  tvaRate: z.number().min(0).max(100),
  categoryId: EntityIdSchema.optional().or(z.literal("")),
})

export const ServiceCategorySchema = z.object({
  name: z.string().min(2),
})

export const PaymentSchema = z.object({
  invoiceId: EntityIdSchema,
  amountCents: z.number().int().positive(),
  method: z.enum(["TRANSFER", "STRIPE", "CASH", "CHECK", "OTHER"]),
  reference: z.string().optional().or(z.literal("")),
})

export const CreditNoteSchema = z.object({
  invoiceId: EntityIdSchema,
  amountCents: z.number().int().positive("Le montant doit être positif"),
  reason: z.string().trim().min(3, "Motif requis").max(300),
})

export const RecurringInvoiceSchema = z.object({
  clientId: EntityIdSchema,
  projectId: EntityIdSchema.optional().or(z.literal("")),
  label: z.string().trim().min(3).max(120),
  object: z.string().trim().min(3).max(180),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "BIANNUALLY", "ANNUALLY"]),
  nextGenDate: z.string().min(1, "Date requise"),
  dueDays: z.number().int().min(0).max(365),
  lines: z.array(InvoiceLineSchema).min(1, "Au moins une ligne est requise"),
})

export const ReminderSchema = z.object({
  invoiceId: EntityIdSchema,
  subject: z.string().trim().min(3).max(180).optional(),
  message: z.string().trim().min(10).max(5000).optional(),
})

export const BankImportSchema = z.object({
  rows: z.array(z.object({
    date: z.string().min(1),
    label: z.string().trim().min(1).max(500),
    amountCents: z.number().int(),
    reference: z.string().trim().max(250).optional().or(z.literal("")),
  })).min(1).max(5000),
})
