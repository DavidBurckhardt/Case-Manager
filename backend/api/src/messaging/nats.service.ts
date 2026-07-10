import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import {
  AckPolicy,
  connect,
  JetStreamClient,
  JetStreamManager,
  NatsConnection,
  RetentionPolicy,
  StringCodec,
} from 'nats'
import {
  JOBS_STREAM,
  JOBS_SUBJECT,
  OcrRequest,
  OcrResult,
  RESULTS_DURABLE,
  RESULTS_STREAM,
  RESULTS_SUBJECT,
} from './contracts'

export type OcrResultHandler = (result: OcrResult) => Promise<void>

/**
 * Thin wrapper over NATS JetStream:
 *   • publishes OCR jobs (ocr.request)
 *   • consumes OCR results (ocr.result) and dispatches them to a handler
 *
 * Streams are created idempotently on startup so the API and the worker can
 * come up in any order.
 */
@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsService.name)
  private readonly sc = StringCodec()

  private nc!: NatsConnection
  private js!: JetStreamClient
  private jsm!: JetStreamManager
  private consuming = false

  async onModuleInit() {
    const url = process.env.NATS_URL ?? 'nats://nats:4222'
    this.nc = await connect({
      servers: url,
      reconnect: true,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
      name: 'api',
    })
    this.logger.log(`Connected to NATS at ${url}`)

    this.jsm = await this.nc.jetstreamManager()
    this.js = this.nc.jetstream()
    await this.ensureStreams()
  }

  async onModuleDestroy() {
    try {
      await this.nc?.drain()
    } catch {
      /* ignore */
    }
  }

  private async ensureStreams() {
    const specs = [
      { name: JOBS_STREAM, subjects: [JOBS_SUBJECT], retention: RetentionPolicy.Workqueue },
      { name: RESULTS_STREAM, subjects: [RESULTS_SUBJECT], retention: RetentionPolicy.Limits },
    ]
    for (const spec of specs) {
      try {
        await this.jsm.streams.add(spec)
        this.logger.log(`Stream ready — ${spec.name} (${spec.subjects[0]})`)
      } catch (err) {
        // Already exists (or concurrent create) — that's fine.
        this.logger.debug(`streams.add ${spec.name}: ${(err as Error).message}`)
      }
    }
  }

  async publishOcrRequest(req: OcrRequest): Promise<void> {
    await this.js.publish(JOBS_SUBJECT, this.sc.encode(JSON.stringify(req)))
  }

  /**
   * Start consuming ocr.result and dispatch each message to `handler`.
   * Called once, from the pipeline module on bootstrap.
   */
  async consumeResults(handler: OcrResultHandler): Promise<void> {
    if (this.consuming) return
    this.consuming = true

    try {
      await this.jsm.consumers.add(RESULTS_STREAM, {
        durable_name: RESULTS_DURABLE,
        ack_policy: AckPolicy.Explicit,
        ack_wait: 60 * 1_000_000_000, // 60s in ns
      })
    } catch (err) {
      this.logger.debug(`consumers.add: ${(err as Error).message}`)
    }

    const consumer = await this.js.consumers.get(RESULTS_STREAM, RESULTS_DURABLE)
    const messages = await consumer.consume()
    this.logger.log('Consuming ocr.result…')

    // Background loop — do not await.
    ;(async () => {
      for await (const m of messages) {
        try {
          const result = JSON.parse(this.sc.decode(m.data)) as OcrResult
          await handler(result)
          m.ack()
        } catch (err) {
          this.logger.error(`Failed handling ocr.result: ${(err as Error).message}`)
          // Redeliver so a transient DB/LLM error doesn't lose the result.
          m.nak()
        }
      }
    })().catch((err) => this.logger.error(`Result consumer stopped: ${err.message}`))
  }
}
