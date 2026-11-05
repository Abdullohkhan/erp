import request from 'supertest'
import type { INestApplication } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { createApp } from '../src/main.js'
import { seed, DEMO_PASSWORD } from '../prisma/seed.js'

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`)
  await seed(prisma, { demo: true })
}

export async function startApp() {
  process.env.NODE_ENV = 'test'
  const app = await createApp()
  await app.init()
  return app
}

export type Api = ReturnType<typeof client>

export function client(app: INestApplication, token?: string) {
  const s = app.getHttpServer()
  const auth = (r: request.Test) => (token ? r.set('Authorization', `Bearer ${token}`) : r)
  return {
    get: (url: string) => auth(request(s).get(`/api${url}`)),
    post: (url: string, body?: object) => auth(request(s).post(`/api${url}`)).send(body ?? {}),
    patch: (url: string, body?: object) => auth(request(s).patch(`/api${url}`)).send(body ?? {}),
    put: (url: string, body?: object) => auth(request(s).put(`/api${url}`)).send(body ?? {}),
    del: (url: string) => auth(request(s).delete(`/api${url}`)),
    /** GET returning the raw body as a Buffer (PDF, scans). */
    binary: (url: string) => auth(request(s).get(`/api${url}`)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => cb(null, Buffer.concat(chunks)))
    }),
    /** multipart/form-data upload in field "file". */
    upload: (url: string, data: Buffer, filename: string, contentType = 'application/octet-stream') =>
      auth(request(s).post(`/api${url}`)).attach('file', data, { filename, contentType }),
  }
}

export async function login(app: INestApplication, username: string, password = DEMO_PASSWORD) {
  const res = await client(app).post('/auth/login', { username, password })
  if (res.status !== 200) throw new Error(`login ${username}: ${res.status} ${JSON.stringify(res.body)}`)
  return client(app, res.body.accessToken as string)
}
