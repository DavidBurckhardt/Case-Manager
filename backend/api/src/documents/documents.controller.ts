import {
  Controller,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthUser } from '../auth/supabase-auth.guard'
import { CaseAccessService } from '../auth/case-access.service'
import { DocumentsService } from './documents.service'
import { maxBytes } from './storage.constants'

@Controller('documents')
@UseGuards(SupabaseAuthGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /**
   * POST /documents/upload — multipart/form-data, field "files" (one or many).
   * Uploads to storage, creates the batch case, and enqueues the extract job.
   */
  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 20, { limits: { fileSize: maxBytes() } }))
  async upload(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @UploadedFiles() files: any[],
    @CurrentUser() user: AuthUser,
  ) {
    return this.documents.uploadBatch(files ?? [], user.id)
  }
}

/**
 * Separado de DocumentsController porque cuelga de /cases, no de /documents —
 * el recurso acá es el expediente y los documentos son su subcolección.
 */
@Controller('cases')
@UseGuards(SupabaseAuthGuard)
export class CaseDocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly caseAccess: CaseAccessService,
  ) {}

  /**
   * POST /cases/:id/documents — mismo multipart que /documents/upload (campo
   * "files"), pero adjunta al expediente existente en vez de crear uno nuevo.
   */
  @Post(':id/documents')
  @UseInterceptors(FilesInterceptor('files', 20, { limits: { fileSize: maxBytes() } }))
  async uploadToCase(
    @Param('id') caseId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @UploadedFiles() files: any[],
    @CurrentUser() user: AuthUser,
  ) {
    await this.caseAccess.assert(caseId, user.id)
    return this.documents.uploadToCase(files ?? [], user.id, caseId)
  }
}
