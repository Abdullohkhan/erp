import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { INestApplication } from '@nestjs/common'
import { login, prisma, resetDb, startApp, type Api } from './helpers.js'

let app: INestApplication
const as: Record<string, Api> = {}

before(async () => {
  await resetDb()
  app = await startApp()
  for (const u of ['director', 'seller1', 'engineer', 'declarant', 'accountant', 'storekeeper']) as[u] = await login(app, u)
})
after(async () => { await app.close(); await prisma.$disconnect() })

const ok = (res: { status: number; body: unknown }, status = 201) => assert.equal(res.status, status, JSON.stringify(res.body))
const balance = async (productId: string) => {
  const b = await prisma.stockBalance.findFirstOrThrow({ where: { warehouseId: 'w1', productId } })
  return { qty: Number(b.qty), reserved: Number(b.reservedQty), available: Number(b.qty) - Number(b.reservedQty) }
}
type Line = { id: string; qty: number; source: string; reservedQty: number; issuedQty: number }

/** A request in CONFIGURATION with the given lines (not submitted yet). */
async function configured(items: object[]) {
  const customerId = (await prisma.customer.findFirstOrThrow()).id
  const r = await as.seller1.post('/requests', { customerId, title: 'Band qilish', warehouseId: 'w1' })
  ok(r)
  ok(await as.engineer.post(`/requests/${r.body.id}/take`))
  ok(await as.engineer.post(`/requests/${r.body.id}/configuration`, { warehouseId: 'w1', items }))
  return r.body.id as string
}

/** REVIEW → ASSEMBLY for a request whose lines are all taken from stock. */
async function reviewToAssembly(id: string) {
  ok(await as.director.post(`/requests/${id}/review`, { markupPct: 10 }))
  ok(await as.seller1.post(`/requests/${id}/customer-decision`, { approved: true }))
  ok(await as.seller1.post(`/requests/${id}/contract`, {}))
  const signed = await as.seller1.post(`/requests/${id}/sign-contract`)
  ok(signed)
  ok(await as.accountant.post('/payments', { type: 'transfer', direction: 'income', amount: signed.body.advanceAmount, category: 'Avans', requestId: id }))
  const r = await as.accountant.post(`/requests/${id}/confirm-advance`)
  ok(r)
  assert.equal(r.body.status, 'ASSEMBLY')
  return r.body.items as Line[]
}

describe('stock reservation (band qilish)', () => {
  it('approved configuration reserves stock; available = qty − reserved', async () => {
    const before = await balance('p1')
    const id = await configured([{ productId: 'p1', qty: 2 }])
    const r = await as.engineer.post(`/requests/${id}/submit-configuration`)
    ok(r)
    assert.equal(r.body.items[0].source, 'stock')
    assert.equal(r.body.items[0].reservedQty, 2)
    const after = await balance('p1')
    assert.equal(after.qty, before.qty, 'reservation does not move goods')
    assert.equal(after.reserved, before.reserved + 2)
    const api = (await as.director.get('/stock-balance')).body.find((b: { productId: string; warehouseId: string }) => b.productId === 'p1' && b.warehouseId === 'w1')
    assert.equal(api.availableQty, after.available)
  })

  it('two requests race for the same goods: only one gets them', async () => {
    const { available } = await balance('p2')
    assert.ok(available > 0)
    const a = await configured([{ productId: 'p2', qty: available }])
    const b = await configured([{ productId: 'p2', qty: available }])
    const [ra, rb] = await Promise.all([
      as.engineer.post(`/requests/${a}/submit-configuration`),
      as.engineer.post(`/requests/${b}/submit-configuration`),
    ])
    ok(ra); ok(rb)
    const sources = [ra.body.items[0].source, rb.body.items[0].source].sort()
    assert.deepEqual(sources, ['purchase', 'stock'], 'exactly one request reserves the goods')
    const after = await balance('p2')
    assert.equal(after.available, 0)
    const loser = ra.body.items[0].source === 'purchase' ? ra.body : rb.body
    assert.equal(loser.items[0].reservedQty, 0)
    assert.equal(loser.status, 'PRICING')
  })

  it('reserved goods cannot be sold, written off or reserved by another request', async () => {
    const { available, reserved } = await balance('p2')
    assert.equal(available, 0)
    assert.ok(reserved > 0)
    const sale = await as.seller1.post('/sale-orders', { customerId: 'c1', warehouseId: 'w1', items: [{ productId: 'p2', qty: 1, price: 1 }], confirm: true })
    assert.equal(sale.status, 400)
    assert.equal((await as.storekeeper.post('/movements', { type: 'writeoff', fromWarehouseId: 'w1', productId: 'p2', qty: 1 })).status, 400)
    const c = await configured([{ productId: 'p2', qty: 1 }])
    const rc = await as.engineer.post(`/requests/${c}/submit-configuration`)
    ok(rc)
    assert.equal(rc.body.items[0].source, 'purchase')
  })

  it('many concurrent requests never over-reserve', async () => {
    const { available } = await balance('p5')
    const per = Math.max(1, Math.floor(available / 2))
    const ids: string[] = []
    for (let i = 0; i < 4; i++) ids.push(await configured([{ productId: 'p5', qty: per }]))
    const res = await Promise.all(ids.map((id) => as.engineer.post(`/requests/${id}/submit-configuration`)))
    for (const r of res) ok(r)
    const winners = res.filter((r) => r.body.items[0].source === 'stock').length
    assert.equal(winners, Math.floor(available / per))
    const after = await balance('p5')
    assert.ok(after.available >= 0 && after.reserved <= after.qty)
  })

  it('assembly turns the reservation into a dispatch; return re-reserves', async () => {
    const before = await balance('p3')
    const id = await configured([{ productId: 'p3', qty: 3 }])
    ok(await as.engineer.post(`/requests/${id}/submit-configuration`))
    const [line] = await reviewToAssembly(id)
    assert.equal(line.reservedQty, 3)
    ok(await as.engineer.post(`/requests/${id}/issue`, { itemId: line.id, qty: 3 }))
    let b = await balance('p3')
    assert.equal(b.qty, before.qty - 3)
    assert.equal(b.reserved, before.reserved, 'reservation consumed by the dispatch')
    ok(await as.engineer.post(`/requests/${id}/return`, { itemId: line.id, qty: 1 }))
    b = await balance('p3')
    assert.equal(b.qty, before.qty - 2)
    assert.equal(b.reserved, before.reserved + 1, 'returned part is held for the request again')
    ok(await as.engineer.post(`/requests/${id}/issue`, { itemId: line.id, qty: 1 }))
    const done = await as.engineer.post(`/requests/${id}/finish-assembly`)
    ok(done)
    assert.equal(done.body.items[0].reservedQty, 0)
    assert.equal((await balance('p3')).reserved, before.reserved)
  })

  it('cancel releases the reservation and returns issued parts', async () => {
    const before = await balance('p4')
    const id = await configured([{ productId: 'p4', qty: 2 }, { productId: 'p4', qty: 1 }])
    ok(await as.engineer.post(`/requests/${id}/submit-configuration`))
    const lines = await reviewToAssembly(id)
    assert.equal((await balance('p4')).reserved, before.reserved + 3)
    ok(await as.engineer.post(`/requests/${id}/issue`, { itemId: lines[0].id, qty: 2 }))
    ok(await as.director.post(`/requests/${id}/cancel`, { comment: 'Mijoz voz kechdi' }))
    const after = await balance('p4')
    assert.deepEqual(after, before)
    const items = await prisma.requestItem.findMany({ where: { requestId: id } })
    assert.ok(items.every((i) => Number(i.reservedQty) === 0 && Number(i.issuedQty) === 0))
  })
})
