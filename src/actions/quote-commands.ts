"use server"

import { ZodError } from "zod"
import { AuthorizationError } from "@/lib/auth-wrapper"
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"
import { QuoteConversionError } from "@/lib/quotes/conversion-error"
import { createContractFromQuote } from "@/actions/devis"
import { convertQuoteToCustomerOrder } from "@/actions/operations"

async function reply<T>(command: () => Promise<T>) {
  try {
    return await command() ?? { error: "Votre session ou votre espace n’est plus disponible. Rechargez la page ; votre saisie est conservée." }
  } catch (error) {
    if (error instanceof QuoteConversionError || error instanceof AuthorizationError) return { error: error.message }
    if (error instanceof ZodError) return { error: "Les valeurs saisies sont invalides. Vérifiez les champs." }
    if (error instanceof Error && error.message === DEMO_READ_ONLY_MESSAGE) return { error: error.message }
    throw error
  }
}

export async function prepareQuoteOrder(input: unknown) { return reply(() => convertQuoteToCustomerOrder(input)) }
export async function prepareQuoteContract(quoteId: string, expectedRevision?: string) { return reply(() => createContractFromQuote(quoteId, expectedRevision)) }
