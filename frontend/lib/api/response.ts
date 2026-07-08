import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { ApiError } from '@/services/case-file.service'

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function handleError(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: 'Validation error', details: err.flatten().fieldErrors },
      { status: 422 }
    )
  }
  console.error('[API]', err)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
