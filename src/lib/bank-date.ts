export function parseBankDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Date bancaire invalide : ${value}`)
  const date = new Date(`${value}T12:00:00`)
  const [year, month, day] = value.split("-").map(Number)
  if (!Number.isFinite(date.getTime()) || date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
    throw new Error(`Date bancaire invalide : ${value}`)
  }
  return date
}
