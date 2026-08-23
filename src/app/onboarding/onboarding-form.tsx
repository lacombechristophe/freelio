"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { type FieldErrors, useForm, useWatch } from "react-hook-form"
import { 
  ChevronRight, 
  ChevronLeft, 
  Check,
  Building2,
  Scale,
  Settings2,
  LayoutTemplate,
  UserPlus
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { completeOnboarding } from "@/actions/onboarding/complete-onboarding"
import { FreelioBrand } from "@/components/shared/freelio-brand"
import {
  OnboardingFormSchema,
  type OnboardingFormInput,
  type OnboardingFormValues,
} from "@/lib/validations"

const PDF_TEMPLATE_OPTIONS = [
  { value: "MINIMAL", label: "Minimal" },
  { value: "PROFESSIONAL", label: "Professionnel" },
  { value: "MODERN", label: "Moderne" },
] as const

const TOTAL_STEPS = 5

const STEP_DETAILS = [
  { title: "Votre activité", description: "Identité et informations principales", icon: Building2 },
  { title: "Cadre légal", description: "Coordonnées, TVA et paiement", icon: Scale },
  { title: "Facturation", description: "Numérotation et conditions", icon: Settings2 },
  { title: "Documents", description: "Style de vos devis et factures", icon: LayoutTemplate },
  { title: "Premier client", description: "Un point de départ concret", icon: UserPlus },
] as const

const FIELDS_BY_STEP = {
  1: ["companyName", "fullName", "siret", "address"],
  2: ["email", "phone", "isTvaApplicable", "tvaNumber", "apeCode", "iban"],
  3: ["invoicePrefix", "paymentTerms", "latePenaltyRate"],
  4: ["pdfTemplate"],
  5: ["firstClientName"],
} satisfies Record<number, (keyof OnboardingFormInput)[]>

function getStepWithError(errors: FieldErrors<OnboardingFormInput>) {
  const steps = Object.entries(FIELDS_BY_STEP) as Array<[
    string,
    (keyof OnboardingFormInput)[],
  ]>

  return steps.find(([, fields]) => fields.some((field) => errors[field]))?.[0]
}

export function OnboardingForm() {
  const [step, setStep] = React.useState(1)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [, startTransition] = React.useTransition()

  const form = useForm<OnboardingFormInput, unknown, OnboardingFormValues>({
    resolver: zodResolver(OnboardingFormSchema),
    shouldUnregister: false,
    defaultValues: {
      companyName: "",
      fullName: "",
      siret: "",
      address: "",
      email: "",
      phone: "",
      isTvaApplicable: false,
      tvaNumber: "",
      apeCode: "",
      iban: "",
      invoicePrefix: "FACT-",
      paymentTerms: "30_DAYS",
      latePenaltyRate: "12.25",
      pdfTemplate: "MINIMAL",
      firstClientName: "",
    },
  })
  const selectedPdfTemplate = useWatch({ control: form.control, name: "pdfTemplate" })
  const isTvaApplicable = useWatch({ control: form.control, name: "isTvaApplicable" })

  function onInvalidSubmit(errors: FieldErrors<OnboardingFormInput>) {
    const errorStep = getStepWithError(errors)
    if (errorStep) setStep(Number(errorStep))
    toast.error("Veuillez corriger les erreurs du formulaire.")
  }

  async function onSubmit(data: OnboardingFormValues) {
    setIsSubmitting(true)
    startTransition(async () => {
      try {
        const response = await completeOnboarding(data)
        
        if (response && !response.success) {
          toast.error(response.error || "Une erreur est survenue lors de la sauvegarde")
          setIsSubmitting(false)
        }
      } catch (error: unknown) {
        // IMPORTANT: Let Next.js handle redirects
        if (
          typeof error === "object" &&
          error !== null &&
          "digest" in error &&
          typeof error.digest === "string" &&
          error.digest.startsWith("NEXT_REDIRECT")
        ) {
          throw error
        }
        
        console.error("[Onboarding] Submission crash:", error)
        toast.error("Erreur de connexion au serveur")
        setIsSubmitting(false)
      }
    })
  }

  const nextStep = async () => {
    const fields = FIELDS_BY_STEP[step as keyof typeof FIELDS_BY_STEP] || []
    const isValid = await form.trigger(fields)
    
    if (isValid) {
      setStep((currentStep) => Math.min(currentStep + 1, TOTAL_STEPS))
    } else {
      toast.error("Veuillez corriger les champs de cette étape.")
    }
  }

  const prevStep = () => {
    setStep((currentStep) => Math.max(currentStep - 1, 1))
  }

  const progressValue = (step / TOTAL_STEPS) * 100
  const activeStep = STEP_DETAILS[step - 1]
  const ActiveStepIcon = activeStep.icon

  return (
    <main className="marketing-surface min-h-screen bg-freelio-canvas text-freelio-ink">
      <header className="flex h-16 items-center border-b border-freelio-line bg-white px-5 sm:px-8 lg:px-10">
        <FreelioBrand href="/" />
        <span className="ml-auto rounded-md bg-freelio-accent-soft px-2.5 py-1 text-xs font-semibold text-freelio-accent">Configuration initiale</span>
      </header>

      <div className="mx-auto grid w-full max-w-[1120px] gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[300px_minmax(0,720px)] lg:gap-14 lg:px-10 lg:py-12">
        <aside className="hidden lg:block">
          <div className="sticky top-10">
            <p className="text-xs font-semibold uppercase text-freelio-accent">Premiers réglages</p>
            <h1 className="marketing-display mt-4 text-[36px] font-semibold leading-[1.05]">Un espace prêt pour votre prochaine mission.</h1>
            <p className="mt-4 text-sm leading-6 text-freelio-muted">Ces informations alimentent automatiquement vos documents. Vous pourrez tout modifier plus tard.</p>

            <ol className="mt-9 space-y-1" aria-label="Étapes de configuration">
              {STEP_DETAILS.map(({ title, description, icon: Icon }, index) => {
                const number = index + 1
                const isCurrent = number === step
                const isComplete = number < step
                return (
                  <li key={title} className="relative">
                    {index < STEP_DETAILS.length - 1 && <span className="absolute left-5 top-10 h-[calc(100%-16px)] w-px bg-freelio-line" />}
                    <div className={cn("relative flex gap-3 rounded-xl p-2.5", isCurrent && "bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-freelio-line")}>
                      <span className={cn("grid size-10 shrink-0 place-items-center rounded-[10px] border text-xs font-semibold", isComplete ? "border-freelio-success bg-freelio-success text-white" : isCurrent ? "border-freelio-accent bg-freelio-accent text-white" : "border-freelio-line bg-white text-freelio-muted")}>
                        {isComplete ? <Check className="size-4" /> : <Icon className="size-4" />}
                      </span>
                      <div className="pt-0.5"><p className={cn("text-sm font-semibold", !isCurrent && !isComplete && "text-freelio-muted")}>{title}</p><p className="mt-0.5 text-xs leading-5 text-freelio-muted">{description}</p></div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-6 lg:hidden">
            <p className="text-xs font-semibold uppercase text-freelio-accent">Étape {step} sur {TOTAL_STEPS}</p>
            <h1 className="marketing-display mt-3 text-3xl font-semibold leading-tight">{activeStep.title}</h1>
            <p className="mt-2 text-sm text-freelio-muted">{activeStep.description}</p>
          </div>

          <div className="mb-5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-freelio-ink">Progression</span>
              <span className="text-freelio-muted">{Math.round(progressValue)} %</span>
            </div>
            <Progress value={progressValue} className="h-1.5 bg-freelio-line" />
          </div>

          <Form {...form}>
          <form 
            onSubmit={(event) => event.preventDefault()} 
            className="space-y-6"
          >
            <Card className="border-freelio-line bg-white shadow-freelio-panel">
              <CardHeader className="border-b border-freelio-line pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-[10px] bg-freelio-accent-soft text-freelio-accent">
                    <ActiveStepIcon className="size-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{activeStep.title}</CardTitle>
                    <CardDescription>{activeStep.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="min-h-[360px] space-y-5">
                <div className={cn(step !== 1 && "hidden", "space-y-4")}>
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom commercial / Raison sociale</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Jean Dupont EI" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prénom & Nom</FormLabel>
                        <FormControl>
                          <Input placeholder="Jean Dupont" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="siret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SIRET</FormLabel>
                        <FormControl>
                          <Input inputMode="numeric" placeholder="12345678900012" {...field} />
                        </FormControl>
                        <FormDescription>14 chiffres. Les espaces sont acceptés.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Adresse du siège</FormLabel>
                        <FormControl>
                          <Input placeholder="10 rue de la Paix, 75000 Paris" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className={cn(step !== 2 && "hidden", "space-y-4")}>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email professionnel</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="contact@votreentreprise.fr" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Téléphone</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="06 12 34 56 78" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-center space-x-2 py-2">
                    <FormField
                      control={form.control}
                      name="isTvaApplicable"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox 
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Assujetti à la TVA</FormLabel>
                            <FormDescription>
                              Décochez si vous êtes en franchise en base de TVA.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                  {isTvaApplicable && (
                    <FormField
                      control={form.control}
                      name="tvaNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Numéro de TVA Intracommunautaire</FormLabel>
                          <FormControl>
                            <Input placeholder="FR 12 345678901" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="apeCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Code APE</FormLabel>
                          <FormControl>
                            <Input placeholder="6201Z" {...field} />
                          </FormControl>
                          <FormDescription>Optionnel, mais utile pour vos mentions légales.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="iban"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IBAN</FormLabel>
                          <FormControl>
                            <Input placeholder="FR76 3000 6000 0112 3456 7890 189" {...field} />
                          </FormControl>
                          <FormDescription>Optionnel. Vous pourrez le modifier plus tard.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className={cn(step !== 3 && "hidden", "space-y-4")}>
                  <FormField
                    control={form.control}
                    name="invoicePrefix"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Préfixe des factures</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormDescription>Par ex: FACT-</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="paymentTerms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Conditions de paiement</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Sélectionnez un délai" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="UPON_RECEIPT">À réception</SelectItem>
                            <SelectItem value="15_DAYS">15 jours</SelectItem>
                            <SelectItem value="30_DAYS">30 jours</SelectItem>
                            <SelectItem value="45_DAYS">45 jours</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="latePenaltyRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Taux de pénalité de retard (%)</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" placeholder="12.25" {...field} />
                        </FormControl>
                        <FormDescription>Exemple : 12.25. Laissez vide pour conserver la valeur par défaut.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className={cn(step !== 4 && "hidden")}>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {PDF_TEMPLATE_OPTIONS.map((template) => (
                      <button
                        type="button"
                        key={template.value}
                        aria-pressed={selectedPdfTemplate === template.value}
                        onClick={() => form.setValue("pdfTemplate", template.value, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })}
                        className={cn(
                          "flex flex-col items-center gap-3 rounded-xl border p-3 text-left outline-none transition-[border-color,background-color,box-shadow,transform] focus-visible:ring-3 focus-visible:ring-ring/25 active:scale-[0.99]",
                          selectedPdfTemplate === template.value 
                            ? "border-primary bg-primary/5 shadow-[0_0_0_2px_rgba(11,99,246,0.12)]" 
                            : "border-freelio-line hover:border-freelio-line-strong hover:bg-freelio-canvas"
                        )}
                      >
                        <div className={cn("relative h-28 w-full overflow-hidden rounded-lg border border-freelio-line bg-white p-3", template.value === "MODERN" && "border-t-4 border-t-primary", template.value === "PROFESSIONAL" && "bg-[#fbfcfe]")}>
                          <div className={cn("h-2 w-12 rounded-sm", template.value === "MINIMAL" ? "bg-freelio-ink" : "bg-primary")} />
                          <div className="mt-3 h-1.5 w-4/5 rounded-sm bg-freelio-line" />
                          <div className="mt-1.5 h-1.5 w-3/5 rounded-sm bg-freelio-line" />
                          <div className="absolute inset-x-3 bottom-3 grid grid-cols-3 gap-1"><span className="h-5 rounded bg-freelio-surface-2" /><span className="h-5 rounded bg-freelio-surface-2" /><span className="h-5 rounded bg-freelio-accent-soft" /></div>
                        </div>
                        <span className="text-sm font-medium">{template.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={cn(step !== 5 && "hidden", "space-y-4")}>
                  <FormField
                    control={form.control}
                    name="firstClientName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom du client (optionnel)</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Agence Web XYZ" {...field} />
                        </FormControl>
                        <FormDescription>Vous pourrez en ajouter d&apos;autres plus tard.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>

              <CardFooter className="justify-between border-t border-freelio-line bg-freelio-canvas/70 px-5 py-4">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={prevStep}
                  disabled={step === 1 || isSubmitting}
                  className="gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Précédent
                </Button>

                {step < TOTAL_STEPS ? (
                  <Button 
                    type="button" 
                    onClick={nextStep}
                    className="gap-2"
                    disabled={isSubmitting}
                  >
                    Continuer
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button 
                    type="button" 
                    className="gap-2 bg-freelio-success hover:bg-[#13744b]"
                    disabled={isSubmitting}
                    onClick={() => {
                      void form.handleSubmit(onSubmit, onInvalidSubmit)()
                    }}
                  >
                    {isSubmitting ? "Initialisation..." : "Terminer"}
                    {!isSubmitting && <Check className="h-4 w-4" />}
                  </Button>
                )}
              </CardFooter>
            </Card>
          </form>
          </Form>
        </section>
      </div>
    </main>
  )
}
