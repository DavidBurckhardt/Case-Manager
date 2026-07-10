import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false })

  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  // Clean NATS drain / connection teardown on SIGTERM.
  app.enableShutdownHooks()

  const port = Number(process.env.PORT ?? 3001)
  await app.listen(port)
  Logger.log(`API gateway listening on :${port} — CORS origins: ${origins.join(', ')}`, 'Bootstrap')
}

bootstrap()
