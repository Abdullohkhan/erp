import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { INestApplication } from '@nestjs/common'
import { login, prisma, resetDb, startApp, type Api } from './helpers.js'

let app: INestApplication
const as: Record<string, Api> = {}

before(async () => {
  await resetDb()
  app = await startApp()
  for (const u of ['admin', 'director', 'seller1', 'engineer', 'declarant', 'supply', 'accountant', 'storekeeper']) as[u] = await login(app, u)
})
after(async () => { await app.close(); await prisma.$disconnect() })

const ok = (res: { status: number; body: unknown }, status = 201) => assert.equal(res.status, status, JSON.stringify(res.body))
type Line = { id: string; productId: string | null; name: string; qty: number; source: string; issuedQty: number }
const stockOf = async (productId: string) => Number((await prisma.stockBalance.findFirstOrThrow({ where: { warehouseId: 'w1', productId } })).qty)

async function newRequest(title = 'Dublikat') {
  const customerId = (await prisma.customer.findFirstOrThrow()).id
  const r = await as.seller1.post('/requests', { customerId, title, warehouseId: 'w1' })
  ok(r)
  return r.body.id as string
}

/** Drives a request from NEW to ASSEMBLY with the given configuration lines. */
async function toAssembly(items: object[], beforePricing?: (id: string, lines: Line[]) => Promise<void>) {
  const supplierId = (await prisma.supplier.findFirstOrThrow()).id
  const id = await newRequest()
  ok(await as.engineer.post(`/requests/${id}/take`))
  ok(await as.engineer.post(`/requests/${id}/configuration`, { warehouseId: 'w1', items }))
  let cur = await as.engineer.post(`/requests/${id}/submit-configuration`)
  ok(cur)
  if (cur.body.status === 'PRICING') {
    let lines = ((await as.declarant.get(`/requests/${id}`)).body.items as Line[]).filter((i) => i.source === 'purchase')
    if (beforePricing) {
      await beforePricing(id, lines)
      lines = ((await as.declarant.get(`/requests/${id}`)).body.items as Line[]).filter((i) => i.source === 'purchase')
    }
    ok(await as.declarant.post(`/requests/${id}/pricing`, { items: lines.map((l) => ({ id: l.id, purchasePrice: 100_000, vatPct: 12 })) }))
    ok(await as.declarant.post(`/requests/${id}/submit-pricing`))
  }
  ok(await as.director.post(`/requests/${id}/review`, { markupPct: 10 }))
  ok(await as.seller1.post(`/requests/${id}/customer-decision`, { approved: true }))
  ok(await as.seller1.post(`/requests/${id}/contract`, {}))
  const signed = await as.seller1.post(`/requests/${id}/sign-contract`)
  ok(signed)
  ok(await as.accountant.post('/payments', { type: 'transfer', direction: 'income', amount: signed.body.advanceAmount, category: 'Avans', requestId: id }))
  cur = await as.accountant.post(`/requests/${id}/confirm-advance`)
  ok(cur)
  if (cur.body.status === 'PROCUREMENT') {
    const lines = (cur.body.items as Line[]).filter((i) => i.source === 'purchase')
    ok(await as.supply.post(`/requests/${id}/procurement`, { items: lines.map((l) => ({ id: l.id, supplierId, actualPrice: 100_000 })) }))
    ok(await as.supply.post(`/requests/${id}/submit-procurement`))
    ok(await as.accountant.post(`/requests/${id}/procurement-decision`, { approved: true }))
    ok(await as.storekeeper.post(`/requests/${id}/receive`))
  }
  const req = (await as.engineer.get(`/requests/${id}`)).body
  assert.equal(req.status, 'ASSEMBLY')
  return { id, items: req.items as Line[] }
}

async function issueAllAndFinish(id: string, items: Line[]) {
  for (const i of items) ok(await as.engineer.post(`/requests/${id}/issue`, { itemId: i.id, qty: i.qty }))
  const done = await as.engineer.post(`/requests/${id}/finish-assembly`)
  ok(done)
  assert.equal(done.body.status, 'ACT')
  return done.body.items as Line[]
}

describe('assembly with duplicate products', () => {
  it('two stock lines of the same product are both issued', async () => {
    const before = await stockOf('p3')
    const { id, items } = await toAssembly([{ productId: 'p3', qty: 3 }, { productId: 'p3', qty: 2 }])
    assert.deepEqual(items.map((i) => i.source), ['stock', 'stock'])
    const after = await issueAllAndFinish(id, items)
    assert.deepEqual(after.map((i) => i.issuedQty), [3, 2])
    assert.equal(await stockOf('p3'), before - 5)
  })

  it('stock line + purchased line of the same product', async () => {
    const { id, items } = await toAssembly([{ productId: 'p4', qty: 3 }, { productId: 'p4', qty: 3 }])
    assert.deepEqual(items.map((i) => i.source), ['stock', 'purchase'])
    await issueAllAndFinish(id, items)
  })

  it('a typed name equal to a catalog product is linked to it (no orphan line)', async () => {
    const p = await prisma.product.findUniqueOrThrow({ where: { id: 'p5' } })
    const before = await stockOf('p5')
    const typed = `  ${p.name.toUpperCase()} `
    const { id, items } = await toAssembly([{ productId: 'p5', qty: 1 }, { name: typed, qty: 1 }])
    assert.deepEqual(items.map((i) => i.productId), ['p5', 'p5'], 'both lines point to the catalog product')
    assert.deepEqual(items.map((i) => i.source), ['stock', 'stock'])
    await issueAllAndFinish(id, items)
    assert.equal(await stockOf('p5'), before - 2)
  })

  it('declarant links one of two identical new lines → the twin is linked too', async () => {
    const product = await as.declarant.post('/products', { code: 'SSD-2TB', name: 'Samsung SSD 2TB', price: 0, costPrice: 0, category: 'electronics' })
    ok(product)
    // The name differs from the catalog name, so it stays unlinked until the declarant links it.
    const { id, items } = await toAssembly([{ name: 'SSD 2TB yangi', qty: 1 }, { name: 'ssd 2tb  yangi', qty: 2 }], async (rid, lines) => {
      assert.deepEqual(lines.map((l) => l.productId), [null, null])
      ok(await as.declarant.post(`/requests/${rid}/pricing`, { items: [{ id: lines[0].id, productId: product.body.id }] }))
    })
    assert.deepEqual(items.map((i) => i.productId), [product.body.id, product.body.id])
    await issueAllAndFinish(id, items)
  })

  it('issuing an unlinked line explains why', async () => {
    const { id } = await toAssembly([{ productId: 'p1', qty: 1 }])
    const line = await prisma.requestItem.findFirstOrThrow({ where: { requestId: id } })
    await prisma.requestItem.update({ where: { id: line.id }, data: { productId: null } })
    const r = await as.engineer.post(`/requests/${id}/issue`, { itemId: line.id, qty: 1 })
    assert.equal(r.status, 400)
    assert.match(r.body.message, /bog'lanmagan/)
  })
})

describe('notifications and visibility', () => {
  it('"Injener ishlamoqda" reaches the seller and the director when the engineer takes a request', async () => {
    const id = await newRequest('Bildirishnoma')
    ok(await as.engineer.post(`/requests/${id}/take`))
    const number = (await prisma.request.findUniqueOrThrow({ where: { id } })).number
    for (const who of ['seller1', 'director']) {
      const user = await prisma.user.findUniqueOrThrow({ where: { username: who } })
      const n = await prisma.notification.findMany({ where: { userId: user.id, title: `${number}: Injener ishlamoqda` } })
      assert.equal(n.length, 1, `${who} must get exactly one notification`)
      assert.match(n[0].body ?? '', /ishga oldi/)
    }
  })

  it('engineer never receives prices (catalog, request)', async () => {
    const products = (await as.engineer.get('/products')).body as Record<string, unknown>[]
    assert.ok(products.length && products.every((p) => !('price' in p) && !('costPrice' in p)))
    assert.ok('price' in ((await as.seller1.get('/products')).body as Record<string, unknown>[])[0], 'seller still sees prices')
    const id = (await prisma.request.findFirstOrThrow({ where: { status: 'ACT' } })).id
    const r = (await as.engineer.get(`/requests/${id}`)).body
    assert.ok(!('totalPrice' in r) && !('contract' in r && r.contract?.body))
    assert.ok(r.items.every((i: object) => !('salePrice' in i) && !('unitCost' in i)))
  })
})

describe('contract and delivery validation', () => {
  it('template with an unknown placeholder or without the items table is rejected', async () => {
    const bad = await as.admin.post('/contract-templates', { name: 'Xato', body: '<p>{{customer.nmae}}</p>{{itemsTable}}' })
    assert.equal(bad.status, 400)
    assert.match(bad.body.message, /customer\.nmae/)
    assert.equal((await as.admin.post('/contract-templates', { name: 'Jadvalsiz', body: '<p>{{number}}</p>' })).status, 400)
    ok(await as.admin.post('/contract-templates', { name: 'Yaxshi', body: '<p>{{number}} {{customer.name}}</p>{{itemsTable}}' }))
  })

  it('contract money is in whole so\'m', async () => {
    const c = await prisma.contract.findFirstOrThrow()
    assert.equal(Number(c.amount), Math.round(Number(c.amount)))
    assert.doesNotMatch(c.body, /,\d{1,2} so'm/)
  })

  it('delivery requires who received the goods', async () => {
    const { id, items } = await toAssembly([{ productId: 'p1', qty: 1 }])
    await issueAllAndFinish(id, items)
    ok(await as.seller1.post(`/requests/${id}/act`))
    assert.equal((await as.supply.post(`/requests/${id}/deliver`)).status, 400)
    const r = await as.supply.post(`/requests/${id}/deliver`, { comment: 'Aliyev Vali, Toshkent' })
    ok(r)
    assert.equal(r.body.status, 'COMPLETED')
  })

  it('procurement rejects an unknown supplier', async () => {
    const id = await newRequest('Xarid')
    ok(await as.engineer.post(`/requests/${id}/take`))
    ok(await as.engineer.post(`/requests/${id}/configuration`, { warehouseId: 'w1', items: [{ productId: 'p3', qty: 500 }] }))
    ok(await as.engineer.post(`/requests/${id}/submit-configuration`))
    const line = await prisma.requestItem.findFirstOrThrow({ where: { requestId: id } })
    ok(await as.declarant.post(`/requests/${id}/pricing`, { items: [{ id: line.id, purchasePrice: 1000 }] }))
    ok(await as.declarant.post(`/requests/${id}/submit-pricing`))
    ok(await as.director.post(`/requests/${id}/review`, { markupPct: 10 }))
    ok(await as.seller1.post(`/requests/${id}/customer-decision`, { approved: true }))
    ok(await as.seller1.post(`/requests/${id}/contract`, {}))
    const signed = await as.seller1.post(`/requests/${id}/sign-contract`)
    ok(await as.accountant.post('/payments', { type: 'transfer', direction: 'income', amount: signed.body.advanceAmount, category: 'Avans', requestId: id }))
    ok(await as.accountant.post(`/requests/${id}/confirm-advance`))
    const r = await as.supply.post(`/requests/${id}/procurement`, { items: [{ id: line.id, supplierId: 'nope', actualPrice: 900 }] })
    assert.equal(r.status, 400)
  })
})
