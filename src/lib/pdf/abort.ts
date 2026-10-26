// A canceled caller must stop waiting even when the underlying filesystem or DNS
// operation cannot itself be canceled. Observe both outcomes to avoid a late rejection.
export function waitForPdfWork<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    if (signal.aborted) abort()
    else signal.addEventListener("abort", abort, { once: true })
    void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort))
  })
}
