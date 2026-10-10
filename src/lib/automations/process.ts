import { processAutomationEvents } from "@/lib/automations/engine"
import { processDueSequenceEmails } from "@/lib/automations/sequences"
import { processCampaignActivations } from "@/lib/marketing/campaign-activation"

async function settle<T>(task: () => Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    return { status: "fulfilled", value: await task() }
  } catch (reason) {
    return { status: "rejected", reason }
  }
}

/** Both entry points drain the durable outbox before advancing sequences. */
export async function processAutomationBatch() {
  const scenarios = await settle(() => processAutomationEvents(50))
  const activations = await settle(() => processCampaignActivations())
  const sequences = await settle(() => processDueSequenceEmails(100))
  return [scenarios, sequences, activations] as const
}
