import OpenAI from 'openai'
import { z } from 'zod'

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _client
}

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'

// ── Zod schema matching the LLM JSON output ───────────────────────────────────

const nullStr  = z.string().nullable().optional()
const nullDate = z.string().nullable().optional() // YYYY-MM-DD

export const extractedCaseSchema = z.object({
  case: z.object({
    title:          nullStr,
    case_number:    z.string().min(1),
    court:          nullStr,
    jurisdiction:   nullStr,
    department:     nullStr,
    process_type:   nullStr,
    legal_matter:   nullStr,
    status:         nullStr,
    filing_date:    nullDate,
    claim_amount:   z.number().nullable().optional(),
  }),

  plaintiff: z.object({
    full_name:      nullStr,
    dni:            nullStr,
    cuil:           nullStr,
    birth_date:     nullDate,
    nationality:    nullStr,
    marital_status: nullStr,
    address:        nullStr,
    city:           nullStr,
    province:       nullStr,
  }).optional(),

  defendants: z.array(z.object({
    name:   z.string(),
    type:   nullStr,
    cuit:   nullStr,
  })).optional().default([]),

  employer: z.object({
    company_name: nullStr,
    cuit:         nullStr,
    activity:     nullStr,
  }).optional(),

  insurance_company: z.object({
    name:          nullStr,
    cuit:          nullStr,
    claim_number:  nullStr,
    policy_number: nullStr,
  }).optional(),

  accident: z.object({
    type:          nullStr,
    date:          nullDate,
    time:          nullStr,
    location:      nullStr,
    province:      nullStr,
    city:          nullStr,
    description:   nullStr,
    work_activity: nullStr,
    mechanism:     nullStr,
  }).optional(),

  medical: z.object({
    diagnosis:                    z.array(z.string()).optional().default([]),
    affected_body_parts:          z.array(z.string()).optional().default([]),
    medical_leave_start:          nullDate,
    medical_discharge_date:       nullDate,
    surgeries:                    z.array(z.string()).optional().default([]),
    treatments:                   z.array(z.string()).optional().default([]),
    current_limitations:          z.array(z.string()).optional().default([]),
    psychological_damage_claimed: z.boolean().optional().default(false),
    permanent_disability:         nullStr,
  }).optional(),

  administrative_proceedings: z.object({
    medical_commission_case: nullStr,
    medical_commission:      nullStr,
    resolution_date:         nullDate,
    medical_opinion:         nullStr,
    administrative_status:   nullStr,
  }).optional(),

  legal_claim: z.object({
    requested_compensation:        z.union([z.string(), z.number()]).nullable().optional().transform((v) => v != null ? String(v) : null),
    legal_arguments:               z.array(z.string()).optional().default([]),
    constitutional_challenges:     z.array(z.string()).optional().default([]),
    requested_medical_benefits:    z.array(z.string()).optional().default([]),
    requested_interest_or_indexation: z.array(z.string()).optional().default([]),
  }).optional(),

  lawyers: z.array(z.object({
    name:          nullStr,
    registration:  nullStr,
    representing:  nullStr,
  })).optional().default([]),

  important_dates: z.array(z.object({
    date:  z.string().nullable().optional(),
    event: z.string(),
  })).optional().default([]),

  documents_detected: z.array(z.string()).optional().default([]),

  summary: nullStr,

  confidence: z.object({
    overall:        z.enum(['High', 'Medium', 'Low']).nullable().optional(),
    missing_fields: z.array(z.string()).optional().default([]),
  }).optional(),
})

export type ExtractedCase = z.infer<typeof extractedCaseSchema>

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert Legal Document Parser specialized in Argentine legal documents.

Your job is NOT to summarize the document.

Your job is to transform raw OCR text extracted from legal PDF files into a structured JSON that will later be used to automatically create a legal case ("expediente").

The OCR input may contain:

- OCR errors
- duplicated pages
- repeated paragraphs
- headers
- footers
- page numbers
- signatures
- stamps
- scanned images converted to text
- multiple legal documents merged into a single PDF
- out-of-order pages

You must reconstruct the information as accurately as possible.

--------------------------------------------------
GENERAL RULES
--------------------------------------------------

1. Never invent information.

2. If a value cannot be determined with reasonable confidence use:

null

3. Never guess dates.

4. Normalize dates using:

YYYY-MM-DD

5. Normalize CUIT/CUIL removing separators.

Example:

20-37598160-3

becomes

20375981603

6. Monetary values must be numeric.

Example

"$59.494.892,60"

becomes

59494892.60

7. Preserve original capitalization only where appropriate.

8. Remove duplicated information.

9. Merge information coming from multiple documents.

10. Prefer information coming from judicial documents over administrative documents when conflicts exist.

Priority:

Court filing
↓
Court notification
↓
Medical Commission
↓
ART documentation
↓
Medical reports
↓
Other documents

11. Never include explanatory text.

Return ONLY valid JSON.

--------------------------------------------------
OUTPUT JSON
--------------------------------------------------

{
  "case": {
    "title": null,
    "case_number": null,
    "court": null,
    "jurisdiction": null,
    "department": null,
    "process_type": null,
    "legal_matter": null,
    "status": null,
    "filing_date": null,
    "claim_amount": null
  },
  "plaintiff": {
    "full_name": null,
    "dni": null,
    "cuil": null,
    "birth_date": null,
    "nationality": null,
    "marital_status": null,
    "address": null,
    "city": null,
    "province": null
  },
  "defendants": [],
  "employer": {
    "company_name": null,
    "cuit": null,
    "activity": null
  },
  "insurance_company": {
    "name": null,
    "cuit": null,
    "claim_number": null,
    "policy_number": null
  },
  "accident": {
    "type": null,
    "date": null,
    "time": null,
    "location": null,
    "province": null,
    "city": null,
    "description": null,
    "work_activity": null,
    "mechanism": null
  },
  "medical": {
    "diagnosis": [],
    "affected_body_parts": [],
    "medical_leave_start": null,
    "medical_discharge_date": null,
    "surgeries": [],
    "treatments": [],
    "current_limitations": [],
    "psychological_damage_claimed": false,
    "permanent_disability": null
  },
  "administrative_proceedings": {
    "medical_commission_case": null,
    "medical_commission": null,
    "resolution_date": null,
    "medical_opinion": null,
    "administrative_status": null
  },
  "legal_claim": {
    "requested_compensation": null,
    "legal_arguments": [],
    "constitutional_challenges": [],
    "requested_medical_benefits": [],
    "requested_interest_or_indexation": []
  },
  "lawyers": [],
  "important_dates": [],
  "documents_detected": [],
  "summary": null,
  "confidence": {
    "overall": null,
    "missing_fields": []
  }
}

--------------------------------------------------
FIELD EXTRACTION RULES
--------------------------------------------------

CASE

Extract:

- judicial case title
- case number
- court
- tribunal
- jurisdiction
- type of action
- amount claimed

PLAINTIFF

Extract:

- full legal name
- DNI
- CUIL
- address
- birth date

DEFENDANTS

Return one object per defendant.

Example

[
 {
   "name":"ASOCIART S.A.",
   "type":"ART",
   "cuit":"30686273330"
 }
]

EMPLOYER

Extract employer independently from defendant.

MEDICAL

Merge all diagnoses.

Example:

[
 "Lumbar strain",
 "Inguinal hernia"
]

Never duplicate diagnoses.

IMPORTANT DATES

Collect every relevant procedural event.

Example

[
 {
   "date":"2025-02-20",
   "event":"Work accident"
 },
 {
   "date":"2025-03-20",
   "event":"Medical discharge"
 },
 {
   "date":"2025-06-16",
   "event":"Medical Commission proceeding initiated"
 },
 {
   "date":"2026-02-23",
   "event":"Judicial claim admitted"
 }
]

DOCUMENTS DETECTED

Detect document types.

Example

[
 "Judicial Complaint",
 "Medical Commission Decision",
 "Medical Discharge",
 "Work Accident Report",
 "Medical Report",
 "National ID",
 "Electronic Court Notification",
 "Salary Receipt",
 "Power of Attorney"
]

SUMMARY

Produce a concise factual summary (maximum 250 words).

Include:

- who is suing
- against whom
- why
- accident description
- medical diagnosis
- procedural status
- compensation sought

Do not include legal opinions.

CONFIDENCE

Estimate extraction quality.

overall:

High
Medium
Low

missing_fields:

Array listing fields that could not be extracted.

--------------------------------------------------
STRICT OUTPUT RULES
--------------------------------------------------

Return ONLY valid JSON.

No markdown.

No explanations.

No comments.

No code fences.

No natural language outside JSON.`

// ── Main extraction function ──────────────────────────────────────────────────

export async function extractCaseMetadata(ocrText: string): Promise<ExtractedCase> {
  console.log(`[extraction] calling ${MODEL} — ${ocrText.length} chars of OCR text`)

  const response = await getClient().chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: ocrText },
    ],
  })

  const raw = response.choices[0]?.message?.content
  if (!raw) throw new Error('Empty response from LLM')

  console.log(`[extraction] raw response length=${raw.length} tokens_used=${response.usage?.total_tokens}`)

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 200)}`)
  }

  const result = extractedCaseSchema.safeParse(parsed)
  if (!result.success) {
    console.error('[extraction] Zod validation failed:', result.error.flatten())
    throw new Error(`Extraction validation failed: ${JSON.stringify(result.error.flatten().fieldErrors)}`)
  }

  console.log(`[extraction] success — case_number="${result.data.case.case_number}" confidence=${result.data.confidence?.overall}`)
  return result.data
}
