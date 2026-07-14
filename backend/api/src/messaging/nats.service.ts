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
import { ExtractRequest, JOBS_DURABLE, JOBS_STREAM, JOBS_SUBJECT } from './contracts'

export type ExtractRequestHandler = (req: ExtractRequest) => Promise<void>

/**
 * Thin wrapper over NATS JetStream. The API is both producer and consumer of the
 * extraction work-queue:
 *   • publishes extraction jobs (extract.request) from the upload request
 *   • consumes them in the background and dispatches to a handler
 *
 * The work-queue retention + explicit ack give us durability and redelivery so a
 * job is never lost on an API restart, and uploads stay non-blocking.
 */
@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsService.name)
  private readonly sc = StringCodec()

  // OCR is gone, but the LLM call over a large batch of PDFs can still take a
  // while — give each message a generous ack window before redelivery.
  private static readonly ACK_WAIT_NS = 15 * 60 * 1_000_000_000 // 15 min in ns
  private static readonly MAX_DELIVER = 4

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
    try {
      await this.jsm.streams.add({
        name: JOBS_STREAM,
        subjects: [JOBS_SUBJECT],
        retention: RetentionPolicy.Workqueue,
      })
      this.logger.log(`Stream ready — ${JOBS_STREAM} (${JOBS_SUBJECT})`)
    } catch (err) {
      // Already exists (or concurrent create) — that's fine.
      this.logger.debug(`streams.add ${JOBS_STREAM}: ${(err as Error).message}`)
    }
  }

  async publishExtractRequest(req: ExtractRequest): Promise<void> {
    await this.js.publish(JOBS_SUBJECT, this.sc.encode(JSON.stringify(req)))
  }

  /**
   * Start consuming extract.request and dispatch each message to `handler`.
   * Called once, from the pipeline on bootstrap. Acks on success; naks on a
   * thrown error so a transient failure is redelivered (up to MAX_DELIVER).
   */
  async consumeRequests(handler: ExtractRequestHandler): Promise<void> {
    if (this.consuming) return
    this.consuming = true

    try {
      await this.jsm.consumers.add(JOBS_STREAM, {
        durable_name: JOBS_DURABLE,
        ack_policy: AckPolicy.Explicit,
        ack_wait: NatsService.ACK_WAIT_NS,
        max_deliver: NatsService.MAX_DELIVER,
      })
    } catch (err) {
      this.logger.debug(`consumers.add: ${(err as Error).message}`)
    }

    const consumer = await this.js.consumers.get(JOBS_STREAM, JOBS_DURABLE)
    const messages = await consumer.consume()
    this.logger.log('Consuming extract.request…')

    // Background loop — do not await.
    ;(async () => {
      for await (const m of messages) {
        try {
          const req = JSON.parse(this.sc.decode(m.data)) as ExtractRequest
          await handler(req)
          m.ack()
        } catch (err) {
          this.logger.error(`Failed handling extract.request: ${(err as Error).message}`)
          // Redeliver so a transient download/LLM error doesn't lose the job.
          m.nak()
        }
      }
    })().catch((err) => this.logger.error(`Request consumer stopped: ${err.message}`))
  }
}
