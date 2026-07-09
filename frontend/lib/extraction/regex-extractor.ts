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

// Valid Argentine CUIL/CUIT prefixes (first 2 digits).
// 20,23,24,27 = natural persons; 30,33,34 = legal entities; 20–27 covers all personal variants.
const VALID_ID_PREFIXES = new Set(['20','23','24','27','30','33','34'])

function isValidArgId(normalized: string): boolean {
  return normalized.length === 11 && VALID_ID_PREFIXES.has(normalized.slice(0, 2))
}

export function regexExtract(text: string): RegexExtraction {
  // ── Case number ──────────────────────────────────────────────────────────
  // Prefer labeled patterns: EXPTE / Expediente / Nro. Expediente SRT
  // Patterns: 292789/25 · 17236/26 · 27-510119
  const caseMatch =
    text.match(/\bEXPTE?\.?\s*(?:N[RO°]{0,2}\.?\s*)?(\d{4,6}\/\d{2,4})\b/i) ??
    text.match(/\bExpediente\s*(?:SRT\s*)?(?:N[°RO]{0,2}\.?\s*)?:\s*(\d{4,6}\/\d{2,4})\b/i) ??
    text.match(/\bNro\.?\s*Expediente[^:]*:\s*(\d{4,6}\/\d{2,4})\b/i) ??
    text.match(/\b(\d{4,6}\/\d{2,4})\b/) ??
    text.match(/\bSiniestro\s*N[°º]?\s*(\d{2}[-–\s]\d{5,7})\b/i) ??
    text.match(/\b(\d{2}[-–]\d{5,7})\b/)
  const case_number = caseMatch?.[1]?.replace(/\s/g, '-') ?? null

  // ── Filing / event dates ─────────────────────────────────────────────────
  // Strategy: prefer labeled accident/filing dates; fall back to first date ≥ 2020
  // (which skips birth dates pre-2000 and hire dates pre-2020 in most cases).
  // Skipped label contexts: "Nacimiento", "Ingreso a Empresa", "Alta Médica" endings.
  let filing_date: string | null = null

  function slashToISO(d: string, mo: string, y: string): string {
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // 1. Look for explicitly labeled accident/event date
  const accidentDateMatch =
    text.match(/Fecha\s+del?\s+accidente\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i) ??
    text.match(/Fecha\s+(?:de\s+)?inicio\s+tr[aá]mite\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i) ??
    text.match(/Fecha\s+de\s+emisi[oó]n\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i)
  if (accidentDateMatch) {
    const [, d, mo, y] = accidentDateMatch
    filing_date = slashToISO(d, mo, y)
  }

  // 2. First slash date with year ≥ 2020 (avoids birth/hire dates)
  if (!filing_date) {
    for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
      const [, d, mo, y] = m
      if (parseInt(y) >= 2020) { filing_date = slashToISO(d, mo, y); break }
    }
  }

  // 3. ISO date fallback
  if (!filing_date) {
    for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
      if (parseInt(m[1]) >= 2020) { filing_date = m[0]; break }
    }
  }

  // 4. Spelled-out date ("23 de febrero de 2026")
  if (!filing_date) {
    const m = text.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i)
    if (m && parseInt(m[3]) >= 2020) {
      const month = MONTHS_ES[m[2].toLowerCase()]
      if (month) filing_date = `${m[3]}-${month}-${m[1].padStart(2, '0')}`
    }
  }

  // ── Monetary claim amount — largest dollar figure in the doc ─────────────
  // Matches: $59.494.892,60 · $ 1.200.000 · $59494892.60
  let claim_amount: number | null = null
  const moneyMatches = [...text.matchAll(/\$\s*([\d.,]+)/g)]
  if (moneyMatches.length) {
    const amounts = moneyMatches.map((m) => {
      const raw = m[1]
      const normalized = raw.includes(',')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(/,/g, '')
      return parseFloat(normalized)
    }).filter((n) => !isNaN(n) && n > 0)
    if (amounts.length) claim_amount = Math.max(...amounts)
  }

  // ── CUIL/CUIT — format XX-XXXXXXXX-X or 11 digits ───────────────────────
  // Validate prefixes to exclude phone numbers (54-...) and other false positives.
  const idMatches = [...text.matchAll(/\b(\d{2}[-–]\d{8}[-–]\d|\d{11})\b/g)]
  const ids = idMatches
    .map((m) => normalizeId(m[1]))
    .filter(isValidArgId)

  // Heuristic: first valid ID is plaintiff CUIL (personal prefix 20/23/24/27);
  // first valid company ID is CUIT (prefix 30/33/34).
  const PERSONAL_PREFIXES = new Set(['20','23','24','27'])
  const COMPANY_PREFIXES  = new Set(['30','33','34'])

  const cuil = ids.find((id) => PERSONAL_PREFIXES.has(id.slice(0, 2))) ?? ids[0] ?? null
  const cuit = ids.find((id) => COMPANY_PREFIXES.has(id.slice(0, 2))) ?? null

  // ── Title — look for "APELLIDO c/ EMPRESA" pattern ──────────────────────
  const titleMatch = text.match(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑA-Za-záéíóúñ ,]+\s+[Cc]\/\s*[A-ZÁÉÍÓÚÑ].{5,80}?)\s*(?:\n|$|S\/)/m)
  const title = titleMatch?.[1]?.trim().replace(/\s+/g, ' ') ?? null

  return { case_number, filing_date, claim_amount, cuil, cuit, title }
}
