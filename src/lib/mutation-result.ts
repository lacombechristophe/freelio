export type MutationFailure = { success: false; error: string }

// Next.js redacts thrown server errors in production. Return only explicitly
// approved business messages; unexpected failures must retain that protection.
export async function expectedMutation<T>(operation: () => Promise<T>, messages: ReadonlySet<string>): Promise<T | MutationFailure> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof Error && messages.has(error.message)) return { success: false, error: error.message }
    throw error
  }
}

export function requireSuccessfulMutation<T>(result: T): Exclude<T, MutationFailure> {
  if (result && typeof result === "object" && "success" in result && result.success === false) {
    throw new Error("error" in result && typeof result.error === "string" ? result.error : "Action refusée.")
  }
  return result as Exclude<T, MutationFailure>
}
