import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { ExtractedCase, extractedCaseSchema, SYSTEM_PROMPT } from './extraction.schema'

/**
 * Un documento entregado al LLM. Trae bytes crudos (PDF/imagen, que el modelo
 * lee de forma nativa) o texto ya extraído (DOCX convertido con mammoth en el
 * pipeline — el modelo no lee .docx directo). Exactamente uno de los dos.
 */
export interface ExtractionFile {
  filename: string
  mime: string
  buffer?: Buffer
  text?: string
}

type InputContent = OpenAI.Responses.ResponseInputContent

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name)
  private readonly model = process.env.OPENAI_MODEL ?? 'gpt-5.6-luna'
  private _client: OpenAI | null = null

  private client(): OpenAI {
    if (!this._client) {
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')
      this._client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    }
    return this._client
  }

  /** Turn a document into a Responses API content part (text vs. image vs. file). */
  private toContentPart(file: ExtractionFile): InputContent {
    // DOCX ya convertido a texto: se manda como bloque de texto, no como adjunto.
    if (file.text != null) {
      return {
        type: 'input_text',
        text: `[Documento adjunto: ${file.filename}]\n\n${file.text}`,
      }
    }
    const dataUrl = `data:${file.mime};base64,${file.buffer!.toString('base64')}`
    if (file.mime.startsWith('image/')) {
      return { type: 'input_image', detail: 'auto', image_url: dataUrl }
    }
    return { type: 'input_file', filename: file.filename, file_data: dataUrl }
  }

  /**
   * Extract structured case metadata by sending the raw documents (PDFs/images)
   * straight to the LLM — no OCR step. All documents of a case go in a single
   * call so the model can cross-reference them (the prompt merges multi-doc info).
   */
  async extractCaseMetadata(files: ExtractionFile[]): Promise<ExtractedCase> {
    if (!files.length) throw new Error('No documents to extract')

    const totalBytes = files.reduce(
      (n, f) => n + (f.buffer?.length ?? Buffer.byteLength(f.text ?? '')),
      0,
    )
    this.logger.log(
      `Calling ${this.model} — ${files.length} document(s), ${(totalBytes / 1024).toFixed(0)} KB`,
    )

    const content: InputContent[] = [
      {
        type: 'input_text',
        text: 'A continuación se adjuntan los documentos de un expediente legal argentino (PDF, imágenes escaneadas o texto extraído de archivos Word). Extraé la información al JSON solicitado.',
      },
      ...files.map((f) => this.toContentPart(f)),
    ]

    const response = await this.client().responses.create({
      model: this.model,
      reasoning: { effort: 'low' },
      instructions: SYSTEM_PROMPT,
      input: [{ role: 'user', content }],
      text: { format: { type: 'json_object' } },
    })

    const raw = response.output_text
    if (!raw) throw new Error('Empty response from LLM')

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 200)}`)
    }

    const result = extractedCaseSchema.safeParse(parsed)
    if (!result.success) {
      this.logger.error(`Zod validation failed: ${JSON.stringify(result.error.flatten().fieldErrors)}`)
      throw new Error('Extraction validation failed')
    }

    this.logger.log(
      `Extraction ok — case_number="${result.data.case.case_number}"`,
    )
    return result.data
  }
}
