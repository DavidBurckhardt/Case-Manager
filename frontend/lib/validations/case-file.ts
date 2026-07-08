import { z } from 'zod'

const PARTY_ROLES = [
  'plaintiff',
  'defendant',
  'third_party',
  'appellant',
  'respondent',
  'witness',
  'other',
] as const

const partySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Party name is required').max(255),
  role: z.enum(PARTY_ROLES, { error: 'Invalid party role' }),
  notes: z.string().max(1000).optional(),
})

export const createCaseFileSchema = z.object({
  case_number: z
    .string()
    .min(1, 'Case number is required')
    .max(100, 'Case number must not exceed 100 characters')
    .trim(),
  caption: z
    .string()
    .min(1, 'Caption (carátula) is required')
    .max(500, 'Caption must not exceed 500 characters')
    .trim(),
  jurisdiction: z.string().max(100).trim().optional(),
  court: z.string().max(255).trim().optional(),
  clerk_office: z.string().max(255).trim().optional(),
  matter: z.string().max(255).trim().optional(),
  current_status_id: z.string().uuid('A valid workflow status is required'),
  responsible_attorney_id: z.string().uuid().optional(),
  parties: z.array(partySchema).max(50, 'A case file may have at most 50 parties').optional(),
})

export const updateCaseFileSchema = z.object({
  case_number: z.string().min(1).max(100).trim().optional(),
  caption: z.string().min(1).max(500).trim().optional(),
  jurisdiction: z.string().max(100).trim().nullable().optional(),
  court: z.string().max(255).trim().nullable().optional(),
  clerk_office: z.string().max(255).trim().nullable().optional(),
  matter: z.string().max(255).trim().nullable().optional(),
  current_status_id: z.string().uuid().optional(),
  responsible_attorney_id: z.string().uuid().nullable().optional(),
  parties: z.array(partySchema).max(50).optional(),
})

export const listCaseFilesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).trim().optional(),
  matter: z.string().max(255).optional(),
  court: z.string().max(255).optional(),
  status_id: z.string().uuid().optional(),
  attorney_id: z.string().uuid().optional(),
})

export type CreateCaseFileInput = z.infer<typeof createCaseFileSchema>
export type UpdateCaseFileInput = z.infer<typeof updateCaseFileSchema>
export type ListCaseFilesQuery = z.infer<typeof listCaseFilesQuerySchema>
