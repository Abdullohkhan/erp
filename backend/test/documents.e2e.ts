import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { login, prisma, resetDb, startApp, type Api } from './helpers.js'
import { amountInWordsUz } from '../src/documents/amount-words.js'

let app: INestApplication
const as: Record<string, Api> = {}

before(async () => {
  await resetDb()
  app = await startApp()
  for (const u of ['director', 'seller1', 'engineer', 'accountant', 'supply']) as[u] = await login(app, u)
})
after(async () => { await app.close(); await prisma.$disconnect() })

const ok = (res: { status: number; body: unknown }, status = 201) => assert.equal(res.status, status, JSON.stringify(res.body))
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 0x20), Buffer.from('\n%%EOF\n')])
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)])
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)])
const onDisk = (rel: string) => join(resolve(process.env.UPLOAD_DIR!), rel)

/** NEW → CONTRACT (contract drafted) with one stock line. */
async function toContract() {
  const r = await as.seller1.post('/requests', { customerId: 'c3', title: 'Hujjatlar', warehouseId: 'w1' })
  ok(r)
  const id = r.body.id as string
  ok(await as.engineer.post(`/requests/${id}/take`))
  ok(await as.engineer.post(`/requests/${id}/configuration`, { warehouseId: 'w1', items: [{ productId: 'p1', qty: 2 }] }))
  ok(await as.engineer.post(`/requests/${id}/submit-configuration`))
  ok(await as.director.post(`/requests/${id}/review`, { markupPct: 10 }))
  ok(await as.seller1.post(`/requests/${id}/customer-decision`, { approved: true }))
  const c = await as.seller1.post(`/requests/${id}/contract`, {})
  ok(c)
  return c.body
}

describe('amount in words in documents', () => {
  it('contract and act contain the total in words; placeholders are allowed in templates', async () => {
    const req = await toContract()
    assert.ok(req.contract.body.includes(`(${amountInWordsUz(req.totalPrice).replaceAll("'", '&#39;')})`), req.contract.body)
    const ph = (await as.director.get('/contract-templates/placeholders')).body.placeholders
    assert.ok(ph.includes('amountInWords') && ph.includes('amountInWordsRu'))
    const admin = await login(app, 'admin')
    ok(await admin.post('/contract-templates', { name: 'So\'z bilan', body: '<p>{{total}} — {{amountInWords}} / {{amountInWordsRu}}</p>{{itemsTable}}' }))
  })
})

describe('server-side PDF', () => {
  let req: { id: string; contract: { id: string; number: string } }
  before(async () => { req = await toContract() })

  it('contract PDF is a real PDF with an embedded Unicode font', async () => {
    const r = await as.seller1.binary(`/contracts/${req.contract.id}/pdf`)
    assert.equal(r.status, 200)
    assert.match(r.headers['content-type'], /application\/pdf/)
    assert.match(r.headers['content-disposition'], /attachment; filename="Shartnoma-SHR-\d+\.pdf"/)
    const pdf = r.body as Buffer
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
    assert.ok(pdf.includes('Roboto'), 'TTF font (Cyrillic + Latin) is embedded')
    assert.ok(pdf.length > 5000)
  })

  it('payment invoice (hisob): HTML preview and PDF', async () => {
    const inv = await as.seller1.get(`/requests/${req.id}/invoice`)
    ok(inv, 200)
    assert.match(inv.body.number, /^HIS-/)
    assert.match(inv.body.html, /so&#39;m\)/)
    const pdf = await as.accountant.binary(`/requests/${req.id}/invoice/pdf`)
    assert.equal(pdf.status, 200)
    assert.equal((pdf.body as Buffer).subarray(0, 5).toString(), '%PDF-')
  })

  it('engineer cannot download documents with prices', async () => {
    assert.equal((await as.engineer.binary(`/contracts/${req.contract.id}/pdf`)).status, 403)
    assert.equal((await as.engineer.get(`/requests/${req.id}/invoice`)).status, 403)
    assert.equal((await as.seller1.binary('/contracts/nope/pdf')).status, 404)
  })
})

describe('signed scans', () => {
  let req: { id: string; contract: { id: string } }
  before(async () => { req = await toContract() })

  it('rejects a missing file, a wrong type, a too large file and a wrong role', async () => {
    const url = `/contracts/${req.contract.id}/scan`
    assert.equal((await as.seller1.post(url)).status, 400)
    const txt = await as.seller1.upload(url, Buffer.from('hello'), 'scan.pdf', 'application/pdf')
    assert.equal(txt.status, 415, 'type is checked by content, not by name')
    const big = await as.seller1.upload(url, Buffer.concat([PDF, Buffer.alloc(1024 * 1024 + 10)]), 'big.pdf', 'application/pdf')
    assert.equal(big.status, 413)
    assert.match(big.body.message, /1 MB/)
    assert.equal((await as.engineer.upload(url, PDF, 'scan.pdf')).status, 403)
    const c = await prisma.contract.findUniqueOrThrow({ where: { id: req.contract.id } })
    assert.equal(c.status, 'draft')
    assert.equal(c.scanFile, null)
  })

  it('a signed scan signs the contract (debt booked, next stage)', async () => {
    const debt = Number((await prisma.customer.findUniqueOrThrow({ where: { id: 'c3' } })).debt)
    const r = await as.seller1.upload(`/contracts/${req.contract.id}/scan`, PDF, '../../imzolangan shartnoma.pdf', 'application/pdf')
    ok(r)
    assert.equal(r.body.status, 'ADVANCE_PAYMENT')
    assert.equal(r.body.contract.status, 'signed')
    const c = await prisma.contract.findUniqueOrThrow({ where: { id: req.contract.id } })
    assert.equal(c.scanName, 'imzolangan shartnoma.pdf', 'no path in the stored name')
    assert.match(c.scanFile!, /^contracts\/[0-9a-f-]{36}\.pdf$/)
    assert.ok(existsSync(onDisk(c.scanFile!)))
    assert.deepEqual(readFileSync(onDisk(c.scanFile!)), PDF)
    assert.equal(Number((await prisma.customer.findUniqueOrThrow({ where: { id: 'c3' } })).debt), debt + Number(c.amount))

    const dl = await as.accountant.binary(`/contracts/${req.contract.id}/scan`)
    assert.equal(dl.status, 200)
    assert.match(dl.headers['content-type'], /application\/pdf/)
    assert.deepEqual(dl.body, PDF)
    assert.equal((await as.engineer.binary(`/contracts/${req.contract.id}/scan`)).status, 403)
  })

  it('re-upload replaces the file (old one removed), contract stays signed once', async () => {
    const before = await prisma.contract.findUniqueOrThrow({ where: { id: req.contract.id } })
    const debt = Number((await prisma.customer.findUniqueOrThrow({ where: { id: 'c3' } })).debt)
    ok(await as.seller1.upload(`/contracts/${req.contract.id}/scan`, PNG, 'skan', 'image/png'))
    const c = await prisma.contract.findUniqueOrThrow({ where: { id: req.contract.id } })
    assert.equal(c.scanMime, 'image/png')
    assert.equal(c.scanName, 'skan.png')
    assert.ok(!existsSync(onDisk(before.scanFile!)))
    assert.equal(Number((await prisma.customer.findUniqueOrThrow({ where: { id: 'c3' } })).debt), debt, 'debt not booked twice')
  })

  it('act scan marks the act signed; act PDF works', async () => {
    const id = req.id
    ok(await as.accountant.post('/payments', { type: 'transfer', direction: 'income', amount: 10_000_000, category: 'Avans', requestId: id }))
    const adv = await as.accountant.post(`/requests/${id}/confirm-advance`)
    ok(adv)
    for (const i of adv.body.items) ok(await as.engineer.post(`/requests/${id}/issue`, { itemId: i.id, qty: i.qty }))
    ok(await as.engineer.post(`/requests/${id}/finish-assembly`))
    const act = await as.seller1.post(`/requests/${id}/act`)
    ok(act)
    assert.equal(act.body.act.status, 'draft')
    assert.match(act.body.act.body, /so&#39;m\)/)
    const r = await as.seller1.upload(`/acts/${act.body.act.id}/scan`, JPG, 'akt.jpg', 'image/jpeg')
    ok(r)
    assert.equal(r.body.act.status, 'signed')
    assert.equal(r.body.status, 'DELIVERY', 'a scan does not move the workflow by itself')
    const pdf = await as.seller1.binary(`/acts/${act.body.act.id}/pdf`)
    assert.equal(pdf.status, 200)
    const dl = await as.seller1.binary(`/acts/${act.body.act.id}/scan`)
    assert.deepEqual(dl.body, JPG)
  })
})
