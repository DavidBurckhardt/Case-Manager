import {
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthUser } from '../auth/supabase-auth.guard'
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
