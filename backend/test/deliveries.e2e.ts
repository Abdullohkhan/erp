import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { INestApplication } from '@nestjs/common'
import { login, prisma, resetDb, startApp, type Api } from './helpers.js'

let app: INestApplication
const as: Record<string, Api> = {}

before(async () => {
  await resetDb()
  app = await startApp()
  for (const u of ['director', 'seller1', 'engineer', 'accountant', 'supply', 'driver1']) as[u] = await login(app, u)
})
after(async () => { await app.close(); await prisma.$disconnect() })

const ok = (res: { status: number; body: unknown }, status = 201) => assert.equal(res.status, status, JSON.stringify(res.body))
const MONEY = ['cost', 'price', 'salePrice', 'unitCost', 'totalPrice', 'totalCost', 'amount']
const noMoney = (o: unknown): boolean => {
  if (Array.isArray(o)) return o.every(noMoney)
  if (o && typeof o === 'object') return Object.entries(o).every(([k, v]) => !MONEY.includes(k) && noMoney(v))
  return true
}

/** A request in the DELIVERY stage (one stock line). */
async function toDelivery() {
  const r = await as.seller1.post('/requests', { customerId: 'c1', title: 'Yetkazish', warehouseId: 'w1' })
  ok(r)
  const id = r.body.id as string
  ok(await as.engineer.post(`/requests/${id}/take`))
  ok(await as.engineer.post(`/requests/${id}/configuration`, { warehouseId: 'w1', items: [{ productId: 'p1', qty: 1 }] }))
  ok(await as.engineer.post(`/requests/${id}/submit-configuration`))
  ok(await as.director.post(`/requests/${id}/review`, { markupPct: 10 }))
  ok(await as.seller1.post(`/requests/${id}/customer-decision`, { approved: true }))
  ok(await as.seller1.post(`/requests/${id}/contract`, {}))
  const signed = await as.seller1.post(`/requests/${id}/sign-contract`)
  ok(await as.accountant.post('/payments', { type: 'transfer', direction: 'income', amount: signed.body.advanceAmount, category: 'Avans', requestId: id }))
  const adv = await as.accountant.post(`/requests/${id}/confirm-advance`)
  ok(await as.engineer.post(`/requests/${id}/issue`, { itemId: adv.body.items[0].id, qty: 1 }))
  ok(await as.engineer.post(`/requests/${id}/finish-assembly`))
  ok(await as.seller1.post(`/requests/${id}/act`))
  return id
}

describe('deliveries (yetkazish)', () => {
  let requestId: string
  let deliveryId: string
  let driverId: string

  it('procurement plans a delivery with a driver user, vehicle, address and cost', async () => {
    requestId = await toDelivery()
    const drivers = (await as.supply.get('/drivers')).body as { id: string; fullName: string }[]
    driverId = drivers.find((d) => d.fullName === 'Sobirov Anvar')!.id
    assert.ok(driverId)
    const before = (await as.director.get(`/requests/${requestId}`)).body.totalCost
    const r = await as.supply.post(`/requests/${requestId}/deliveries`, {
      driverId, vehicleNumber: '01 A 123 BC', address: 'Toshkent, Chilonzor 5', plannedAt: '2026-11-10T09:00:00Z', cost: 150_000.4,
    })
    ok(r)
    deliveryId = r.body.id
    assert.equal(r.body.status, 'PLANNED')
    assert.equal(r.body.driverName, 'Sobirov Anvar')
    assert.equal(r.body.cost, 150_000, "whole so'm")
    assert.match(r.body.number, /^YV-/)
    const req = (await as.director.get(`/requests/${requestId}`)).body
    assert.equal(req.deliveryCost, 150_000)
    assert.equal(req.totalCost, before + 150_000, 'logistics is added to the request cost')
    const n = await prisma.notification.findMany({ where: { userId: driverId } })
    assert.ok(n.some((x) => x.title.includes('yangi yetkazish')))
  })

  it('validation: one open delivery per request, driver must have the driver role, request must be in DELIVERY', async () => {
    assert.equal((await as.supply.post(`/requests/${requestId}/deliveries`, { driverName: 'Ali', address: 'X' })).status, 400)
    const seller = await prisma.user.findUniqueOrThrow({ where: { username: 'seller1' } })
    const other = await toDelivery()
    assert.equal((await as.supply.post(`/requests/${other}/deliveries`, { driverId: seller.id, address: 'X' })).status, 400)
    assert.equal((await as.supply.post(`/requests/${other}/deliveries`, { address: 'X' })).status, 400, 'driver required')
    ok(await as.supply.post(`/requests/${other}/deliveries`, { driverName: 'Tashqi haydovchi', driverPhone: '+998901112233', address: 'Samarqand' }))
    assert.equal((await as.seller1.post(`/requests/${other}/deliveries`, { driverName: 'A', address: 'B' })).status, 403)
  })

  it('driver sees only own deliveries, without any money; cannot open requests', async () => {
    const list = (await as.driver1.get('/deliveries')).body as { id: string; driverId: string }[]
    assert.ok(list.length >= 1)
    assert.ok(list.every((d) => d.driverId === driverId), 'only own deliveries')
    assert.ok(noMoney(list), JSON.stringify(list))
    const one = await as.driver1.get(`/deliveries/${deliveryId}`)
    ok(one, 200)
    assert.deepEqual(one.body.items, [{ name: (await prisma.product.findUniqueOrThrow({ where: { id: 'p1' } })).name, qty: 1, unit: 'dona' }])
    const foreign = (await as.supply.get('/deliveries')).body.find((d: { driverId: string | null }) => !d.driverId)
    assert.equal((await as.driver1.get(`/deliveries/${foreign.id}`)).status, 404)
    assert.equal((await as.driver1.get(`/requests/${requestId}`)).status, 403)
    assert.equal((await as.driver1.get('/products')).status, 403)
    assert.ok(noMoney((await as.engineer.get(`/requests/${requestId}`)).body.deliveries), 'engineer sees no logistics cost')
  })

  it('waybill (yo\'l varaqasi) has no prices and is a PDF', async () => {
    const w = await as.driver1.get(`/deliveries/${deliveryId}/waybill`)
    ok(w, 200)
    assert.match(w.body.html, /YO'L VARAQASI/)
    assert.match(w.body.html, /01 A 123 BC/)
    assert.doesNotMatch(w.body.html, /so&#39;m/)
    const pdf = await as.driver1.binary(`/deliveries/${deliveryId}/waybill/pdf`)
    assert.equal(pdf.status, 200)
    assert.equal((pdf.body as Buffer).subarray(0, 5).toString(), '%PDF-')
  })

  it('driver: in transit → delivered completes the request; wrong transitions are rejected', async () => {
    assert.equal((await as.driver1.post(`/deliveries/${deliveryId}/status`, { status: 'DELIVERED' })).status, 400, 'receiver required')
    const t = await as.driver1.post(`/deliveries/${deliveryId}/status`, { status: 'IN_TRANSIT' })
    ok(t)
    assert.equal(t.body.status, 'IN_TRANSIT')
    assert.ok(t.body.departedAt)
    assert.equal((await as.driver1.post(`/deliveries/${deliveryId}/status`, { status: 'IN_TRANSIT' })).status, 400)
    const d = await as.driver1.post(`/deliveries/${deliveryId}/status`, { status: 'DELIVERED', receivedBy: 'Karimov Alisher' })
    ok(d)
    assert.equal(d.body.status, 'DELIVERED')
    assert.ok(d.body.deliveredAt)
    const req = (await as.director.get(`/requests/${requestId}`)).body
    assert.equal(req.status, 'COMPLETED')
    assert.ok(req.events.some((e: { action: string }) => e.action === 'delivered'))
    assert.equal((await as.supply.patch(`/deliveries/${deliveryId}`, { address: 'Y' })).status, 400, 'closed delivery is read-only')
  })

  it('returned delivery → a new one can be planned; another driver cannot change it', async () => {
    const id = await toDelivery()
    const d1 = await as.supply.post(`/requests/${id}/deliveries`, { driverName: 'Tashqi', address: 'Buxoro' })
    ok(d1)
    assert.equal((await as.driver1.post(`/deliveries/${d1.body.id}/status`, { status: 'IN_TRANSIT' })).status, 404)
    assert.equal((await as.supply.post(`/deliveries/${d1.body.id}/status`, { status: 'RETURNED' })).status, 400, 'reason required')
    ok(await as.supply.post(`/deliveries/${d1.body.id}/status`, { status: 'RETURNED', comment: 'Mijoz uyda yo\'q' }))
    assert.equal((await as.director.get(`/requests/${id}`)).body.status, 'DELIVERY')
    const d2 = await as.supply.post(`/requests/${id}/deliveries`, { driverId, address: 'Buxoro', cost: 50_000 })
    ok(d2)
    ok(await as.supply.patch(`/deliveries/${d2.body.id}`, { vehicleNumber: '80 B 777 AA' }), 200)
    // The old "deliver" action closes the open delivery too.
    ok(await as.supply.post(`/requests/${id}/deliver`, { comment: 'Qabul qildi: Vali' }))
    const closed = await prisma.delivery.findUniqueOrThrow({ where: { id: d2.body.id } })
    assert.equal(closed.status, 'DELIVERED')
    assert.equal(closed.vehicleNumber, '80 B 777 AA')
  })
})
