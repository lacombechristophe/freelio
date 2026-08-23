import Link from "next/link"
import { Settings2 } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"

type OnboardingRequiredProps = {
  title: string
  description: string
}

export function OnboardingRequired({ title, description }: OnboardingRequiredProps) {
  return (
    <section
      aria-labelledby="onboarding-required-title"
      className="mx-auto flex min-h-[50vh] w-full max-w-xl flex-col items-center justify-center gap-6 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Settings2 aria-hidden="true" className="h-7 w-7" />
      </div>
      <div className="space-y-2">
        <h1 id="onboarding-required-title" className="text-2xl font-bold tracking-tight">
          {title}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Link href="/onboarding" className={buttonVariants({ variant: "default" })}>
        Terminer la configuration
      </Link>
    </section>
  )
}
