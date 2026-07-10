import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service'

export interface AuthUser {
  id: string
  email?: string
}

/**
 * Validates the incoming `Authorization: Bearer <supabase-jwt>` header and
 * attaches the resolved user to the request as `req.user`.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest()
    const header: string = req.headers?.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null

    if (!token) throw new UnauthorizedException('Missing bearer token')

    const user = await this.supabase.getUserFromToken(token)
    if (!user) throw new UnauthorizedException('Invalid or expired token')

    req.user = user
    return true
  }
}
