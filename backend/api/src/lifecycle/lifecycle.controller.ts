import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthUser } from '../auth/supabase-auth.guard'
import { SupabaseService } from '../supabase/supabase.service'
import { LifecycleService } from './lifecycle.service'

interface TransitionBody {
  to_state_code?: string
  justification?: string
}

@Controller()
@UseGuards(SupabaseAuthGuard)
export class LifecycleController {
  constructor(
    private readonly lifecycle: LifecycleService,
    private readonly supabase: SupabaseService,
  ) {}

  /** Catálogo de estados con sus transiciones válidas — alimenta los botones del frontend. */
  @Get('workflow-states')
  async states() {
    return this.lifecycle.getStates()
  }

  @Get('cases/:id/lifecycle/history')
  async history(@Param('id') caseId: string, @CurrentUser() user: AuthUser) {
    await this.assertCaseAccess(caseId, user.id)
    return this.lifecycle.getHistory(caseId)
  }

  @Post('cases/:id/lifecycle/transition')
  async transition(
    @Param('id') caseId: string,
    @Body() body: TransitionBody,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertCaseAccess(caseId, user.id)

    if (!body?.to_state_code) throw new BadRequestException('to_state_code es obligatorio')

    return this.lifecycle.transitionManual(
      caseId,
      body.to_state_code,
      user.id,
      body.justification ?? '',
    )
  }

  /**
   * Misma regla que can_access_case() en la base (migración 23): creador,
   * abogado responsable, o rol con alcance de estudio. Se replica acá porque
   * el servicio usa el cliente service_role, que saltea RLS.
   */
  private async assertCaseAccess(caseId: string, userId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = this.supabase.admin as any

    const { data: caseFile, error } = await db
      .from('case_files')
      .select('created_by, responsible_attorney_id')
      .eq('id', caseId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !caseFile) throw new NotFoundException('Expediente no encontrado')

    if (caseFile.created_by === userId || caseFile.responsible_attorney_id === userId) return

    const { data: me } = await db.from('users').select('role').eq('id', userId).maybeSingle()
    if (me?.role === 'admin' || me?.role === 'socio') return

    throw new ForbiddenException('Sin acceso a este expediente')
  }
}
