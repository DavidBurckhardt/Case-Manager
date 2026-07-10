import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { AuthUser } from './supabase-auth.guard'

/** Injects the authenticated user attached by SupabaseAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    return context.switchToHttp().getRequest().user
  },
)
