// Retry only a transaction that the database has explicitly aborted. A timeout
// or a lost connection can have an unknown commit result and must not be replayed.
export function isTransactionConflict(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false
  if (error.code === "P2034") return true
  if (error.code !== "P2010" || !("meta" in error) || !error.meta || typeof error.meta !== "object") return false
  return "code" in error.meta && ["40001", "40P01"].includes(String(error.meta.code))
}
