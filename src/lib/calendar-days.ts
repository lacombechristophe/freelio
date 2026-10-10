function dayFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
}

function dayKey(value: Date | string, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

export function calendarDayKey(value: Date | string, timeZone = "UTC") {
  return dayKey(value, dayFormatter(timeZone))
}

export function shiftCalendarDay(key: string, days: number) {
  const date = new Date(`${key}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function calendarPeriods(now: Date, timeZone: string) {
  const formatter = dayFormatter(timeZone)
  const today = dayKey(now, formatter)
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay()
  const monday = shiftCalendarDay(today, -(weekday === 0 ? 6 : weekday - 1))
  const month = `${today.slice(0, 7)}-01`
  const nextMonth = new Date(`${month}T00:00:00.000Z`)
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
  const start = (key: string) => {
    const midnight = Date.parse(`${key}T00:00:00.000Z`)
    let lower = midnight - 36 * 3_600_000
    let upper = midnight + 36 * 3_600_000
    // Find the first instant of the civil day, even when midnight is skipped or repeated.
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2)
      if (dayKey(new Date(middle), formatter) < key) lower = middle + 1
      else upper = middle
    }
    return new Date(lower)
  }
  return {
    todayStart: start(today),
    tomorrowStart: start(shiftCalendarDay(today, 1)),
    weekStart: start(monday),
    weekEnd: start(shiftCalendarDay(monday, 7)),
    monthStart: start(month),
    monthEnd: start(nextMonth.toISOString().slice(0, 10)),
    yearStart: start(`${today.slice(0, 4)}-01-01`),
    yearEnd: start(`${Number(today.slice(0, 4)) + 1}-01-01`),
  }
}
