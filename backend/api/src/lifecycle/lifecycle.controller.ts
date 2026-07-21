import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthUser } from '../auth/supabase-auth.guard'
import { CaseAccessService } from '../auth/case-access.service'
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
    private readonly caseAccess: CaseAccessService,
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

  /** Delega en CaseAccessService — la regla vive en un solo lugar. */
  private assertCaseAccess(caseId: string, userId: string): Promise<void> {
    return this.caseAccess.assert(caseId, userId)
  }
}
