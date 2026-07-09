/**
 * Lightweight regex-based extractor for Argentine legal documents.
 * Used in Phase 1 (pdf-parse text) for instant case preview before OCR+LLM.
 * Only extracts high-confidence, structurally consistent fields.
 */

export interface RegexExtraction {
  case_number: string | null
  filing_date: string | null  // YYYY-MM-DD
  claim_amount: number | null
  cuil: string | null         // plaintiff CUIL (normalized, no separators)
  cuit: string | null         // defendant/employer CUIT (normalized)
  title: string | null        // best-effort case title from first "c/" line
}

const MONTHS_ES: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
}

function normalizeId(raw: string): string {
  return raw.replace(/[-–.\s]/g, '')
}

export function regexExtract(text: string): RegexExtraction {
  // ── Case number ──────────────────────────────────────────────────────────
  // Patterns: 17236/26 · 292789/25 · 27-510119
  const caseMatch =
    text.match(/\bEXPTE?\.?\s*(?:N[RO°]{0,2}\.?\s*)?(\d{4,6}\/\d{2,4})\b/i) ??
    text.match(/\b(\d{4,6}\/\d{2,4})\b/) ??
    text.match(/\b(\d{2}-\d{5,7})\b/)
  const case_number = caseMatch?.[1] ?? null

  // ── Filing / event dates — pick the FIRST date found ────────────────────
  // Format: 23/02/2026 or 2026-02-23 or "23 de febrero de 2026"
  let filing_date: string | null = null

  const dateSlashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (dateSlashMatch) {
    const [, d, m, y] = dateSlashMatch
    filing_date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  if (!filing_date) {
    const dateISOMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
    if (dateISOMatch) filing_date = dateISOMatch[0]
  }

  if (!filing_date) {
    const dateTextMatch = text.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i)
    if (dateTextMatch) {
      const month = MONTHS_ES[dateTextMatch[2].toLowerCase()]
      if (month) {
        filing_date = `${dateTextMatch[3]}-${month}-${dateTextMatch[1].padStart(2, '0')}`
      }
    }
  }

  // ── Monetary claim amount — largest dollar figure in the doc ─────────────
  // Matches: $59.494.892,60 · $ 1.200.000 · $59494892.60
  let claim_amount: number | null = null
  const moneyMatches = [...text.matchAll(/\$\s*([\d.,]+)/g)]
  if (moneyMatches.length) {
    const amounts = moneyMatches.map((m) => {
      const raw = m[1]
      // Argentine format: dots as thousands sep, comma as decimal
      const normalized = raw.includes(',')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(/,/g, '')
      return parseFloat(normalized)
    }).filter((n) => !isNaN(n) && n > 0)

    if (amounts.length) claim_amount = Math.max(...amounts)
  }

  // ── CUIL/CUIT — format XX-XXXXXXXX-X or 11 digits ───────────────────────
  const idMatches = [...text.matchAll(/\b(\d{2}[-–]\d{8}[-–]\d|\d{11})\b/g)]
  const ids = idMatches.map((m) => normalizeId(m[1])).filter((id) => id.length === 11)

  // Heuristic: first ID tends to be plaintiff CUIL, others may be CUIT
  const cuil = ids[0] ?? null
  const cuit = ids.find((id, i) => i > 0) ?? ids[0] ?? null

  // ── Title — look for "APELLIDO c/ EMPRESA" pattern ──────────────────────
  const titleMatch = text.match(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑA-Za-záéíóúñ ,]+\s+[Cc]\/\s*[A-ZÁÉÍÓÚÑ].{5,80}?)\s*(?:\n|$|S\/)/m)
  const title = titleMatch?.[1]?.trim().replace(/\s+/g, ' ') ?? null

  return { case_number, filing_date, claim_amount, cuil, cuit, title }
}
