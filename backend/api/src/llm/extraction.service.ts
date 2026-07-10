import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'
import { ExtractedCase, extractedCaseSchema, SYSTEM_PROMPT } from './extraction.schema'

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name)
  private readonly model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
  private _client: OpenAI | null = null

  private client(): OpenAI {
    if (!this._client) {
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')
      this._client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    }
    return this._client
  }

  async extractCaseMetadata(ocrText: string): Promise<ExtractedCase> {
    this.logger.log(`Calling ${this.model} — ${ocrText.length} chars of OCR text`)

    const response = await this.client().chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: ocrText },
      ],
    })

    const raw = response.choices[0]?.message?.content
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
      `Extraction ok — case_number="${result.data.case.case_number}" confidence=${result.data.confidence?.overall}`,
    )
    return result.data
  }
}
