// Existing estimate: 500 € for an eight-hour working day.
export function consumedTimeBudgetCents(durationSec: number) {
  return Math.round((durationSec / 3600) * 6250)
}
