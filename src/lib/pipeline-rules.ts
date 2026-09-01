import { z } from "zod"

export type PipelineStage = {
  id: string
  title: string
}

export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  { id: "PROSPECT", title: "Prospect" },
  { id: "CONTACTED", title: "Contact pris" },
  { id: "QUALIFIED", title: "Besoin qualifié" },
  { id: "SENT", title: "Devis envoyé" },
  { id: "WON", title: "Gagné" },
]

const pipelineStageSchema = z.object({
  id: z.string().trim().min(1).max(64).regex(/^[A-Z][A-Z0-9_]*$/, "Identifiant d’étape invalide"),
  title: z.string().trim().min(1, "Le nom de l’étape est requis").max(120),
})

const pipelineStagesSchema = z.array(pipelineStageSchema).min(2).max(15)

export function validatePipelineStages(value: unknown): PipelineStage[] {
  const stages = pipelineStagesSchema.parse(value)
  if (new Set(stages.map((stage) => stage.id)).size !== stages.length) {
    throw new Error("Chaque étape doit avoir un identifiant unique")
  }
  if (new Set(stages.map((stage) => stage.title.toLocaleLowerCase("fr"))).size !== stages.length) {
    throw new Error("Chaque étape doit avoir un nom unique")
  }
  if (!stages.some((stage) => stage.id === "WON")) {
    throw new Error("Le pipeline doit conserver l’étape système Gagné")
  }
  return stages
}

export function parsePipelineStages(value: unknown): PipelineStage[] {
  try {
    return validatePipelineStages(value)
  } catch {
    return DEFAULT_PIPELINE_STAGES
  }
}

export function resolveOpportunityStage(input: {
  status: string
  probability: number
  lostReason?: string | null
  closedAt?: Date | null
  now?: Date
}) {
  const lostReason = input.lostReason?.trim() || null
  if (input.status === "LOST") {
    if (!lostReason || lostReason.length < 2) throw new Error("Le motif de perte est requis")
    return { probability: 0, lostReason, closedAt: input.closedAt ?? input.now ?? new Date() }
  }
  if (input.status === "WON") {
    return { probability: 100, lostReason: null, closedAt: input.closedAt ?? input.now ?? new Date() }
  }
  return { probability: input.probability, lostReason: null, closedAt: null }
}
