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

  const current = parseDate(startDate)

  // Art. 156 CPCCN: no se cuenta el día de la notificación. El conteo arranca
  // al día siguiente y el PRIMER día hábil posterior es el día 1 — no el 0.
  // Por eso se avanza y se cuenta en el mismo paso: tratar ese día como 0
  // corre todo el plazo un día hábil hacia adelante.
  if (days === 0) {
    do {
      current.setDate(current.getDate() + 1)
    } while (!(await isBusinessDay(current)))
    return toDateString(current)
  }

  let counted = 0
  while (counted < days) {
    current.setDate(current.getDate() + 1)
    if (await isBusinessDay(current)) {
      counted++
    }
  }

  return toDateString(current)
}

/**
 * Días hábiles que faltan entre `from` (exclusivo) y `to` (inclusivo).
 * Devuelve 0 si `to` ya pasó o es hoy — el caller trata 0 como "vence hoy o vencido".
 */
export async function businessDaysUntil(
  from: string,
  to: string,
  getHolidays: (year: number) => Promise<Set<string>>,
): Promise<number> {
  const target = parseDate(to)
  const current = parseDate(from)

  if (target <= current) return 0

  const holidayCache = new Map<number, Set<string>>()

  async function isBusinessDay(date: Date): Promise<boolean> {
    if (isWeekend(date)) return false
    const year = date.getFullYear()
    if (!holidayCache.has(year)) {
      holidayCache.set(year, await getHolidays(year))
    }
    return !holidayCache.get(year)!.has(toDateString(date))
  }

  let count = 0
  let guard = 0
  while (current < target) {
    current.setDate(current.getDate() + 1)
    if (await isBusinessDay(current)) count++
    if (++guard > MAX_DAYS * 2) {
      throw new Error(`businessDaysUntil: range ${from}..${to} exceeds supported span`)
    }
  }

  return count
}

// SMOKE TEST (pegar en node --input-type=module):
// import { addBusinessDays } from './business-days.js'
// const holidays = new Set(['2026-05-01', '2026-05-25'])
// const result = await addBusinessDays('2026-04-30', 5, async () => holidays)
// console.log(result) // esperado: 2026-05-08
//   jue 30/4 notificación (no se cuenta) · vie 1/5 feriado · 2-3/5 finde
//   día 1 lun 4/5 · 2 mar 5/5 · 3 mié 6/5 · 4 jue 7/5 · 5 vie 8/5
