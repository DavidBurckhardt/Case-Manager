import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthUser } from '../auth/supabase-auth.guard'
import { UsersService } from './users.service'

@Controller('users')
@UseGuards(SupabaseAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** PATCH /users/:id/role — cambia el rol de un usuario. Solo admin o socio. */
  @Patch(':id/role')
  async changeRole(
    @CurrentUser() actor: AuthUser,
    @Param('id') targetId: string,
    @Body('role') role: string,
  ) {
    return this.users.changeRole(actor.id, targetId, role)
  }
}
