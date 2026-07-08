import { type NextRequest } from 'next/server'
import { createCaseFile, listCaseFiles } from '@/services/case-file.service'
import { createCaseFileSchema, listCaseFilesQuerySchema } from '@/lib/validations/case-file'
import { ok, handleError } from '@/lib/api/response'

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams)
    const query = listCaseFilesQuerySchema.parse(params)
    const result = await listCaseFiles(query)
    return ok(result)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const input = createCaseFileSchema.parse(body)
    const caseFile = await createCaseFile(input)
    return ok(caseFile, 201)
  } catch (err) {
    return handleError(err)
  }
}
