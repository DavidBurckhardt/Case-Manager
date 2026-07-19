import { z } from 'zod'

// .catch(null) handles cases where the LLM returns an object or array
// instead of a string/date — coerces to null rather than failing the parse.
const nullStr = z.string().nullable().optional().catch(null)
const nullDate = z.string().nullable().optional().catch(null) // YYYY-MM-DD

// ── Procedural acts (deadline engine input) ──────────────────────────────────
// Each act found in the documents that may trigger a procedural deadline.
// The act_type maps 1:1 to the CPCCN deadline table used by the deadline engine.
export const PROCEDURAL_ACT_TYPES = [
  'TRASLADO_DEMANDA',            // → Contestar demanda (15 días hábiles)
  'TRASLADO_RECONVENCION',      // → Contestar reconvención (15)
  'APERTURA_PRUEBA',            // → Ofrecer prueba (10)
  'SENTENCIA_PRIMERA_INSTANCIA',// → Apelar (5)
  'EXPRESION_AGRAVIOS',         // → Contestar agravios (6)
  'INTIMACION_PAGO_ART_504',    // → Oponer excepciones (5)
  'CADUCIDAD_INSTANCIA',        // → Impulsar proceso (90 días hábiles)
  'OTRO',                       // acto sin plazo asociado en la tabla base
] as const

export type ProceduralActType = (typeof PROCEDURAL_ACT_TYPES)[number]

const proceduralActSchema = z.object({
  // Physical document type as it appears in the file
  document_type: nullStr, // CEDULA | SENTENCIA | PROVIDENCIA | OFICIO | ESCRITO | DEMANDA | OTRO
  // Deadline-triggering event; null when the document triggers no known deadline
  act_type: z.enum(PROCEDURAL_ACT_TYPES).nullable().optional().catch(null),
  // Date printed on the document
  document_date: nullDate,
  // Notification/service date (e.g. cédula). Deadlines run from HERE, not document_date.
  notification_date: nullDate,
  // Short factual description of the act, in Spanish
  description: nullStr,
})

export const extractedCaseSchema = z.object({
  case: z.object({
    title: nullStr,
    case_number: z.string().min(1),
    court: nullStr,
    jurisdiction: nullStr,
    department: nullStr,
    process_type: nullStr,
    legal_matter: nullStr,
    status: nullStr,
    filing_date: nullDate,
    claim_amount: z.number().nullable().optional(),
  }),

  plaintiff: z
    .object({
      full_name: nullStr,
      dni: nullStr,
      cuil: nullStr,
      birth_date: nullDate,
      nationality: nullStr,
      marital_status: nullStr,
      address: nullStr,
      city: nullStr,
      province: nullStr,
    })
    .optional(),

  defendants: z
    .array(z.object({ name: z.string(), type: nullStr, cuit: nullStr }))
    .catch([]),

  employer: z
    .object({ company_name: nullStr, cuit: nullStr, activity: nullStr })
    .optional(),

  insurance_company: z
    .object({ name: nullStr, cuit: nullStr, claim_number: nullStr, policy_number: nullStr })
    .optional(),

  accident: z
    .object({
      type: nullStr,
      date: nullDate,
      time: nullStr,
      location: nullStr,
      province: nullStr,
      city: nullStr,
      description: nullStr,
      work_activity: nullStr,
      mechanism: nullStr,
    })
    .optional(),

  medical: z
    .object({
      diagnosis: z.array(z.string()).catch([]),
      affected_body_parts: z.array(z.string()).catch([]),
      medical_leave_start: nullDate,
      medical_discharge_date: nullDate,
      surgeries: z.array(z.string()).catch([]),
      treatments: z.array(z.string()).catch([]),
      current_limitations: z.array(z.string()).catch([]),
      psychological_damage_claimed: z.boolean().optional().default(false),
      permanent_disability: nullStr,
    })
    .optional(),

  administrative_proceedings: z
    .object({
      medical_commission_case: nullStr,
      medical_commission: nullStr,
      resolution_date: nullDate,
      medical_opinion: nullStr,
      administrative_status: nullStr,
    })
    .optional(),

  legal_claim: z
    .object({
      requested_compensation: z
        .union([z.string(), z.number()])
        .nullable()
        .optional()
        .transform((v) => (v != null ? String(v) : null)),
      legal_arguments: z.array(z.string()).catch([]),
      constitutional_challenges: z.array(z.string()).catch([]),
      requested_medical_benefits: z.array(z.string()).catch([]),
      requested_interest_or_indexation: z.array(z.string()).catch([]),
    })
    .optional(),

  lawyers: z
    .array(z.object({ name: nullStr, registration: nullStr, representing: nullStr }))
    .catch([]),

  important_dates: z
    .array(z.object({ date: z.string().nullable().optional(), event: z.string() }))
    .catch([]),

  // Procedural acts that may trigger deadlines — consumed by the deadline engine
  procedural_acts: z.array(proceduralActSchema).catch([]),

  documents_detected: z.array(z.string()).catch([]),

  summary: nullStr,

})

export type ExtractedCase = z.infer<typeof extractedCaseSchema>

export const SYSTEM_PROMPT = `You are an expert Legal Document Parser specialized in Argentine legal documents.

Your job is NOT to summarize the document.

Your job is to read the contents of the attached legal PDF and image files and transform them into a structured JSON that will later be used to automatically create a legal case ("expediente").

The input documents may contain:

- scanned or photographed pages of varying quality
- duplicated pages
- repeated paragraphs
- headers
- footers
- page numbers
- signatures
- stamps
- handwritten annotations
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

5. All free-text output fields (summary, event descriptions, diagnoses, affected body parts, document types, legal arguments, treatments, limitations, and any other descriptive string) MUST be written in Spanish. The input documents are in Spanish — preserve the language.

6. Normalize CUIT/CUIL removing separators.

Example:

20-37598160-3

becomes

20375981603

7. Monetary values must be numeric.

Example

"$59.494.892,60"

becomes

59494892.60

8. Remove duplicated information.

9. Merge information coming from multiple documents.

10. Prefer information coming from judicial documents over administrative documents when conflicts exist.

Priority:

Court filing → Court notification → Medical Commission → ART documentation → Medical reports → Other documents

11. Never include explanatory text. Return ONLY valid JSON.

--------------------------------------------------
OUTPUT JSON SHAPE
--------------------------------------------------

{
  "case": { "title": null, "case_number": null, "court": null, "jurisdiction": null, "department": null, "process_type": null, "legal_matter": null, "status": null, "filing_date": null, "claim_amount": null },
  "plaintiff": { "full_name": null, "dni": null, "cuil": null, "birth_date": null, "nationality": null, "marital_status": null, "address": null, "city": null, "province": null },
  "defendants": [],
  "employer": { "company_name": null, "cuit": null, "activity": null },
  "insurance_company": { "name": null, "cuit": null, "claim_number": null, "policy_number": null },
  "accident": { "type": null, "date": null, "time": null, "location": null, "province": null, "city": null, "description": null, "work_activity": null, "mechanism": null },
  "medical": { "diagnosis": [], "affected_body_parts": [], "medical_leave_start": null, "medical_discharge_date": null, "surgeries": [], "treatments": [], "current_limitations": [], "psychological_damage_claimed": false, "permanent_disability": null },
  "administrative_proceedings": { "medical_commission_case": null, "medical_commission": null, "resolution_date": null, "medical_opinion": null, "administrative_status": null },
  "legal_claim": { "requested_compensation": null, "legal_arguments": [], "constitutional_challenges": [], "requested_medical_benefits": [], "requested_interest_or_indexation": [] },
  "lawyers": [],
  "important_dates": [],
  "procedural_acts": [],
  "documents_detected": [],
  "summary": null,
}

--------------------------------------------------
PROCEDURAL ACTS (procedural_acts) — CRITICAL FOR DEADLINES
--------------------------------------------------

This is the MOST important extraction for the system. The application computes
procedural deadlines ("plazos") automatically from these acts, so a missed or
mis-dated act means a missed legal deadline.

For EACH distinct procedural act found across the documents, add one object to
"procedural_acts" with:

- "document_type": the physical document, one of:
  "CEDULA" | "SENTENCIA" | "PROVIDENCIA" | "OFICIO" | "ESCRITO" | "DEMANDA" | "OTRO"

- "act_type": the deadline-triggering event. Use EXACTLY one of these strings,
  or null if the act triggers no known deadline:

  "TRASLADO_DEMANDA"            → traslado de la demanda (contestar, 15 días hábiles)
  "TRASLADO_RECONVENCION"      → traslado de reconvención (contestar, 15)
  "APERTURA_PRUEBA"            → auto de apertura a prueba (ofrecer prueba, 10)
  "SENTENCIA_PRIMERA_INSTANCIA"→ sentencia de 1ª instancia (apelar, 5)
  "EXPRESION_AGRAVIOS"         → traslado de expresión de agravios (contestar, 6)
  "INTIMACION_PAGO_ART_504"    → intimación de pago art. 504 CPCCN (oponer excepciones, 5)
  "CADUCIDAD_INSTANCIA"        → ausencia de impulso procesal por 90 días hábiles (caducidad de instancia);
                                  usar cuando el documento mencione explícitamente una intimación por
                                  caducidad, o cuando sea la última actuación conocida y hayan transcurrido
                                  o estén próximos los 90 días sin impulso procesal
  "OTRO"                       → acto procesal sin plazo en la tabla anterior

- "document_date": the date printed on the document (YYYY-MM-DD) or null.

- "notification_date": the date the party was NOTIFIED / served (fecha de
  notificación de la cédula, fecha de recepción). THIS is when deadlines start
  counting — never confuse it with document_date. If the document is a cédula,
  this is usually the diligenciamiento/notification date. null if not present.

- "description": one short factual sentence in Spanish describing the act.

Rules:
- Only include real procedural acts. Do NOT invent acts.
- If the same act appears in duplicated pages, include it ONCE.
- Prefer notification_date from the cédula over any date in the body.
- If you cannot classify the act_type with confidence, use null (not a guess).

--------------------------------------------------

SUMMARY: produce a concise factual summary (max 250 words) covering who is suing, against whom, why, accident description, medical diagnosis, procedural status, compensation sought. No legal opinions. In Spanish.

--------------------------------------------------
STRICT OUTPUT RULES
--------------------------------------------------

Return ONLY valid JSON. No markdown. No explanations. No comments. No code fences. No natural language outside JSON.`
