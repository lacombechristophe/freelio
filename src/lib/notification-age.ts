export function notificationAge(createdAt: Date | string, referenceTime: number, compact = false) {
  const date = new Date(createdAt)
  const seconds = (referenceTime - date.getTime()) / 1000
  if (seconds < 60) return "à l'instant"
  if (seconds < 3600) return compact ? `${Math.floor(seconds / 60)}min` : `il y a ${Math.floor(seconds / 60)} min`
  if (seconds < 86400) return compact ? `${Math.floor(seconds / 3600)}h` : `il y a ${Math.floor(seconds / 3600)}h`
  if (compact) return `${Math.floor(seconds / 86400)}j`
  if (seconds < 2_592_000) return `il y a ${Math.floor(seconds / 86400)}j`
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
}
