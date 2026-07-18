const MAX_DAYS = 500

export function toDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDate(s: string): Date {
  // Parse YYYY-MM-DD without timezone shift (local midnight)
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

export async function addBusinessDays(
  startDate: string,
  days: number,
  getHolidays: (year: number) => Promise<Set<string>>,
): Promise<string> {
  if (days > MAX_DAYS) {
    throw new Error(`days=${days} exceeds maximum allowed (${MAX_DAYS})`)
  }

  const holidayCache = new Map<number, Set<string>>()

  async function holidays(year: number): Promise<Set<string>> {
    if (!holidayCache.has(year)) {
      holidayCache.set(year, await getHolidays(year))
    }
    return holidayCache.get(year)!
  }

  async function isBusinessDay(date: Date): Promise<boolean> {
    if (isWeekend(date)) return false
    const h = await holidays(date.getFullYear())
    return !h.has(toDateString(date))
  }

  // Art. 156 CPCCN: el plazo corre a partir del día hábil siguiente a startDate
  const current = parseDate(startDate)
  current.setDate(current.getDate() + 1)

  // Avanzar hasta el primer día hábil siguiente a startDate
  while (!(await isBusinessDay(current))) {
    current.setDate(current.getDate() + 1)
  }

  // Contar `days` días hábiles desde ahí (si days === 0, ya estamos)
  let counted = 0
  while (counted < days) {
    current.setDate(current.getDate() + 1)
    if (await isBusinessDay(current)) {
      counted++
    }
  }

  return toDateString(current)
}

// SMOKE TEST (pegar en node --input-type=module):
// import { addBusinessDays } from './business-days.js'
// const holidays = new Set(['2026-05-01', '2026-05-25'])
// const result = await addBusinessDays('2026-04-30', 5, async () => holidays)
// console.log(result) // esperado: 2026-05-08 (saltea 2/5 fin de sem, 1/5 feriado)
