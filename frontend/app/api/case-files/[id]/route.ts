import { type NextRequest } from 'next/server'
import {
  getCaseFileById,
  updateCaseFile,
  softDeleteCaseFile,
} from '@/services/case-file.service'
import { updateCaseFileSchema } from '@/lib/validations/case-file'
import { ok, handleError } from '@/lib/api/response'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const caseFile = await getCaseFileById(id)
    return ok(caseFile)
  } catch (err) {
    return handleError(err)
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const input = updateCaseFileSchema.parse(body)
    const caseFile = await updateCaseFile(id, input)
    return ok(caseFile)
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await softDeleteCaseFile(id)
    return ok({ deleted: true })
  } catch (err) {
    return handleError(err)
  }
}
