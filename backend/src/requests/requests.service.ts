import { ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService, type Tx } from '../common/prisma.service.js'
import { BusinessError } from '../common/errors.js'
import { nextNumber } from '../common/numbering.js'
import { num } from '../common/serialize.js'
import { canSeePrices, has } from '../auth/decorators.js'
import type { AuthUser } from '../auth/auth.types.js'
import type { Permission } from '../auth/permissions.js'
import { Prisma } from '../generated/prisma/client.js'
import type { RequestStatus } from '../generated/prisma/enums.js'
import { StockService, type DocItem } from '../stock/stock.service.js'
import { FinanceService } from '../finance/finance.service.js'
import { getSettings } from '../system/settings.js'
import { DEFAULT_ACT_TEMPLATE, DEFAULT_CONTRACT_TEMPLATE, fmtDate, fmtMoney, itemsTable, renderTemplate } from '../documents/render.js'
import { amountWords } from '../documents/amount-words.js'
import { NotificationsService } from './notifications.service.js'
import { STATUS_OWNER, FINAL_STATUSES } from './workflow.js'
import { advanceAmount, salePrice, unitCost } from './pricing.js'

const full = {
  customer: true,
  items: { orderBy: { sortOrder: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
  contract: true,
  act: true,
} as const satisfies Prisma.RequestInclude

type FullRequest = Prisma.RequestGetPayload<{ include: typeof full }>
type Item = FullRequest['items'][number]

/** Comparable product name: trimmed, lower-case, single spaces. */
const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

const COST_FIELDS = [
  'purchasePrice', 'customsDutyPct', 'vatPct', 'excisePct', 'customsFee', 'certificateCost', 'labCost', 'serviceFee',
  'logisticsCost', 'unitCost', 'actualPrice', 'actualLogistics', 'otherCosts', 'supplierId',
] as const

/** Per-unit landed cost from the actual procurement figures (falls back to the declarant estimate). */
function actualUnitCost(i: Item): number {
  if (i.actualPrice === null) return num(i.unitCost)
  return unitCost({
    qty: num(i.qty), purchasePrice: num(i.actualPrice), customsDutyPct: num(i.customsDutyPct), vatPct: num(i.vatPct),
    excisePct: num(i.excisePct), customsFee: num(i.customsFee), certificateCost: num(i.certificateCost), labCost: num(i.labCost),
    serviceFee: num(i.serviceFee), logisticsCost: num(i.actualLogistics) + num(i.otherCosts),
  })
}

export const totals = (r: { items: Item[]; advancePct: Prisma.Decimal; paid: Prisma.Decimal }) => {
  const totalCost = r.items.reduce((s, i) => s + num(i.unitCost) * num(i.qty), 0)
  const totalPrice = r.items.reduce((s, i) => s + num(i.salePrice) * num(i.qty), 0)
  return {
    totalCost: Math.round(totalCost),
    totalPrice: Math.round(totalPrice),
    advanceAmount: advanceAmount(totalPrice, num(r.advancePct)),
    balance: Math.round(totalPrice - num(r.paid)),
  }
}

@Injectable()
export class RequestsService {
  constructor(
    private prisma: PrismaService,
    private stock: StockService,
    private finance: FinanceService,
    private notify: NotificationsService,
  ) {}

  // ───────────── Reading ─────────────

  canSeePrices(u: AuthUser) {
    return canSeePrices(u)
  }

  /** Removes money the user may not see: the engineer never sees prices, only finance roles see costs. */
  present(u: AuthUser, r: FullRequest) {
    const seeCost = has(u, 'costs.view')
    const seePrice = this.canSeePrices(u)
    const t = totals(r)
    const items = r.items.map((i) => {
      const out: Record<string, unknown> = { ...i }
      if (!seeCost) for (const f of COST_FIELDS) delete out[f]
      if (!seePrice) delete out.salePrice
      return out
    })
    const base = { ...r, items, owner: STATUS_OWNER[r.status] }
    if (!seePrice) {
      const { contract: _c, act: _a, paid: _p, markupPct: _m, ...rest } = base
      return { ...rest, contract: r.contract ? { id: r.contract.id, number: r.contract.number, status: r.contract.status } : null, act: r.act ? { id: r.act.id, number: r.act.number } : null }
    }
    return { ...base, ...(seeCost ? t : { totalPrice: t.totalPrice, advanceAmount: t.advanceAmount, balance: t.balance }), ...(seeCost ? {} : { markupPct: undefined }) }
  }

  async list(u: AuthUser, filter: { status?: RequestStatus; mine?: boolean }) {
    const rows = await this.prisma.request.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.mine ? { OR: [{ createdById: u.id }, { assigneeId: u.id }] } : {}),
      },
      include: { customer: { select: { id: true, name: true } }, items: true },
      orderBy: { updatedAt: 'desc' },
    })
    const seePrice = this.canSeePrices(u)
    return rows.map(({ items, ...r }) => ({
      id: r.id, number: r.number, kind: r.kind, title: r.title, status: r.status, customerId: r.customerId,
      customerName: r.customer.name, deadline: r.deadline, assigneeId: r.assigneeId, createdById: r.createdById,
      createdAt: r.createdAt, updatedAt: r.updatedAt, itemCount: items.length,
      missingCount: items.filter((i) => !i.productId).length,
      ...(seePrice ? { totalPrice: totals({ items, advancePct: r.advancePct, paid: r.paid }).totalPrice, paid: num(r.paid) } : {}),
    }))
  }

  async get(u: AuthUser, id: string) {
    return this.present(u, await this.prisma.request.findUniqueOrThrow({ where: { id }, include: full }))
  }

  // ───────────── Helpers ─────────────

  private require(u: AuthUser, perm: Permission) {
    if (!has(u, perm)) throw new ForbiddenException("Bu amal uchun ruxsat yo'q")
  }

  private async load(tx: Tx, id: string, statuses: RequestStatus[]) {
    // Row lock: two people cannot move the same request at once.
    await tx.$queryRaw`SELECT id FROM "Request" WHERE id = ${id} FOR UPDATE`
    const r = await tx.request.findUniqueOrThrow({ where: { id }, include: full })
    if (!statuses.includes(r.status)) {
      throw new BusinessError(`Zayavka hozir "${STATUS_OWNER[r.status].label}" bosqichida, bu amalni bajarib bo'lmaydi`)
    }
    return r
  }

  /**
   * Changes the status and notifies the next stage's role plus the request's creator.
   * `notify.alsoPerms` adds more roles (each user is notified once), `notify.title` overrides the status label.
   */
  private async move(
    tx: Tx, u: AuthUser, r: { id: string; number: string; status: RequestStatus; createdById: string }, to: RequestStatus, action: string,
    comment?: string | null, extra: { title?: string; alsoPerms?: Permission[] } = {},
  ) {
    await tx.request.update({ where: { id: r.id }, data: { status: to } })
    await tx.requestEvent.create({ data: { requestId: r.id, fromStatus: r.status, toStatus: to, action, comment: comment ?? undefined, userId: u.id, userName: u.fullName } })
    const owner = STATUS_OWNER[to]
    const link = `/requests/${r.id}`
    const title = `${r.number}: ${extra.title ?? owner.label}`
    const perms = [...(owner.perm ? [owner.perm] : []), ...(extra.alsoPerms ?? [])]
    if (perms.length) await this.notify.toPermission(tx, perms, title, comment ?? null, link, [u.id, r.createdById])
    if (r.createdById !== u.id) await this.notify.toUser(tx, r.createdById, title, comment ?? null, link)
  }

  private event(tx: Tx, u: AuthUser, requestId: string, action: string, comment?: string | null) {
    return tx.requestEvent.create({ data: { requestId, action, comment: comment ?? undefined, userId: u.id, userName: u.fullName } })
  }

  private run<T>(fn: (tx: Tx) => Promise<T>) {
    return this.prisma.$transaction(fn, { timeout: 20_000 })
  }

  private async done(u: AuthUser, id: string) {
    return this.get(u, id)
  }

  // ───────────── Actions ─────────────

  async create(u: AuthUser, b: { customerId: string; title: string; description?: string | null; kind: string; warehouseId?: string | null; deadline?: Date | null }) {
    this.require(u, 'requests.create')
    const id = await this.run(async (tx) => {
      const s = await getSettings(tx)
      const warehouseId = b.warehouseId ?? (await tx.warehouse.findFirst({ where: { isActive: true }, orderBy: { code: 'asc' } }))?.id
      const r = await tx.request.create({ data: {
        number: await nextNumber(tx, 'ZAY'), customerId: b.customerId, title: b.title, description: b.description ?? undefined,
        kind: b.kind, warehouseId, deadline: b.deadline ?? undefined, createdById: u.id,
        markupPct: s.defaultMarkupPct, advancePct: s.advancePct,
      } })
      await tx.requestEvent.create({ data: { requestId: r.id, toStatus: 'NEW', action: 'create', comment: b.description ?? undefined, userId: u.id, userName: u.fullName } })
      await this.notify.toPermission(tx, 'requests.configure', `${r.number}: yangi zayavka`, b.title, `/requests/${r.id}`, u.id)
      return r.id
    })
    return this.done(u, id)
  }

  async comment(u: AuthUser, id: string, comment: string) {
    await this.run(async (tx) => {
      const r = await tx.request.findUniqueOrThrow({ where: { id } })
      await this.event(tx, u, id, 'comment', comment)
      if (r.assigneeId && r.assigneeId !== u.id) await this.notify.toUser(tx, r.assigneeId, `${r.number}: izoh`, comment, `/requests/${id}`)
    })
    return this.done(u, id)
  }

  /** Engineer takes a new request ("Ishga olamiz"): seller and director see "Injener ishlamoqda". */
  async take(u: AuthUser, id: string, comment?: string | null) {
    this.require(u, 'requests.configure')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['NEW'])
      await tx.request.update({ where: { id }, data: { assigneeId: u.id } })
      await this.move(tx, u, r, 'CONFIGURATION', 'take', `${u.fullName} ishga oldi${comment ? `: ${comment}` : ''}`, { title: 'Injener ishlamoqda', alsoPerms: ['requests.review'] })
    })
    return this.done(u, id)
  }

  /** Engineer's configuration: product lines (or free-text lines for goods not in the catalog yet). */
  async saveConfiguration(u: AuthUser, id: string, b: { warehouseId?: string | null; items: { productId?: string | null; name?: string | null; qty: number; note?: string | null }[] }) {
    this.require(u, 'requests.configure')
    await this.run(async (tx) => {
      await this.load(tx, id, ['CONFIGURATION'])
      const products = await tx.product.findMany({ where: { id: { in: b.items.map((i) => i.productId).filter((x): x is string => !!x) } } })
      // A typed name that exactly matches a catalog product (name or code) is linked to it, so a duplicate line
      // of the same product is taken from stock like the selected one instead of staying "not in catalog".
      const typed = [...new Set(b.items.filter((i) => !i.productId && i.name?.trim()).map((i) => normName(i.name!)))]
      const byName = new Map<string, (typeof products)[number]>()
      if (typed.length) {
        const candidates = await tx.product.findMany({ where: { isActive: true, OR: typed.flatMap((n) => [{ name: { equals: n, mode: 'insensitive' as const } }, { code: { equals: n, mode: 'insensitive' as const } }]) } })
        for (const n of typed) {
          const hits = candidates.filter((p) => normName(p.name) === n || normName(p.code) === n)
          if (hits.length === 1) byName.set(n, hits[0])
        }
      }
      await tx.requestItem.deleteMany({ where: { requestId: id } })
      await tx.requestItem.createMany({ data: b.items.map((i, idx) => {
        const p = products.find((x) => x.id === i.productId) ?? (i.name?.trim() ? byName.get(normName(i.name)) : undefined)
        if (!p && !i.name?.trim()) throw new BusinessError(`${idx + 1}-qator: mahsulot yoki nom kiriting`)
        return { requestId: id, productId: p?.id ?? null, name: p?.name ?? i.name!.trim(), unit: p?.unit ?? 'dona', qty: i.qty, note: i.note ?? undefined, sortOrder: idx }
      }) })
      if (b.warehouseId) await tx.request.update({ where: { id }, data: { warehouseId: b.warehouseId } })
      await this.event(tx, u, id, 'configure')
    })
    return this.done(u, id)
  }

  /** Lines covered by stock stay "stock"; everything else must be bought → declarant prices it. */
  async submitConfiguration(u: AuthUser, id: string, comment?: string | null) {
    this.require(u, 'requests.configure')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['CONFIGURATION'])
      if (r.items.length === 0) throw new BusinessError("Konfiguratsiya bo'sh")
      if (!r.warehouseId) throw new BusinessError('Ombor tanlanmagan')
      const needed = new Map<string, number>()
      let anyPurchase = false
      for (const i of r.items) {
        let source = 'purchase'
        if (i.productId) {
          const bal = await tx.stockBalance.findUnique({ where: { warehouseId_productId: { warehouseId: r.warehouseId, productId: i.productId } } })
          const available = num(bal?.qty) - num(bal?.reservedQty) - (needed.get(i.productId) ?? 0)
          if (available >= num(i.qty)) {
            source = 'stock'
            needed.set(i.productId, (needed.get(i.productId) ?? 0) + num(i.qty))
          }
        }
        if (source === 'purchase') anyPurchase = true
        await tx.requestItem.update({ where: { id: i.id }, data: {
          source,
          ...(source === 'stock' ? { unitCost: await this.stock.costOf(tx, r.warehouseId, i.productId!) } : {}),
        } })
      }
      await this.move(tx, u, r, anyPurchase ? 'PRICING' : 'REVIEW', 'submit-configuration', comment)
    })
    return this.done(u, id)
  }

  /** Declarant: TN VED, customs, VAT, certificates, logistics → landed unit cost. */
  async savePricing(u: AuthUser, id: string, b: { items: ({ id: string; productId?: string | null } & Partial<Record<'tnvedCode', string | null>> & Partial<Record<'purchasePrice' | 'customsDutyPct' | 'vatPct' | 'excisePct' | 'customsFee' | 'certificateCost' | 'labCost' | 'serviceFee' | 'logisticsCost', number>>)[] }) {
    this.require(u, 'requests.price')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['PRICING'])
      for (const patch of b.items) {
        const item = r.items.find((i) => i.id === patch.id)
        if (!item) throw new BusinessError('Qator topilmadi')
        const { id: _id, productId, ...fields } = patch
        const merged = { ...item, ...fields }
        let product = productId ? await tx.product.findUnique({ where: { id: productId } }) : null
        if (productId && !product) throw new BusinessError('Mahsulot topilmadi')
        const cost = merged.purchasePrice !== null && merged.purchasePrice !== undefined
          ? unitCost({
            qty: num(item.qty), purchasePrice: num(merged.purchasePrice), customsDutyPct: num(merged.customsDutyPct), vatPct: num(merged.vatPct),
            excisePct: num(merged.excisePct), customsFee: num(merged.customsFee), certificateCost: num(merged.certificateCost),
            labCost: num(merged.labCost), serviceFee: num(merged.serviceFee), logisticsCost: num(merged.logisticsCost),
          })
          : null
        if (product && fields.tnvedCode && !product.tnvedCode) product = await tx.product.update({ where: { id: product.id }, data: { tnvedCode: fields.tnvedCode } })
        await tx.requestItem.update({ where: { id: item.id }, data: {
          ...fields, unitCost: cost ?? undefined,
          ...(product ? { productId: product.id, name: product.name, unit: product.unit } : {}),
        } })
        // Other still-unlinked lines with the same typed name are the same product: link them too.
        if (product && !item.productId) {
          const twins = r.items.filter((x) => x.id !== item.id && !x.productId && normName(x.name) === normName(item.name) && !b.items.some((q) => q.id === x.id && q.productId))
          for (const x of twins) {
            await tx.requestItem.update({ where: { id: x.id }, data: { productId: product.id, name: product.name, unit: product.unit } })
            x.productId = product.id
          }
        }
      }
      await this.event(tx, u, id, 'pricing')
    })
    return this.done(u, id)
  }

  async submitPricing(u: AuthUser, id: string, comment?: string | null) {
    this.require(u, 'requests.price')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['PRICING'])
      for (const i of r.items.filter((x) => x.source === 'purchase')) {
        if (!i.productId) throw new BusinessError(`"${i.name}" katalogga qo'shilmagan (mahsulotni yarating va bog'lang)`)
        if (!i.purchasePrice || num(i.purchasePrice) <= 0 || i.unitCost === null) throw new BusinessError(`"${i.name}" uchun narx kiritilmagan`)
      }
      await this.move(tx, u, r, 'REVIEW', 'submit-pricing', comment)
    })
    return this.done(u, id)
  }

  /** Price review: markup on top of the landed cost (optionally a manual price per line). */
  async review(u: AuthUser, id: string, b: { markupPct: number; prices?: { id: string; salePrice: number }[]; comment?: string | null }) {
    this.require(u, 'requests.review')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['REVIEW'])
      for (const i of r.items) {
        if (i.unitCost === null) throw new BusinessError(`"${i.name}" uchun tannarx yo'q`)
        const manual = b.prices?.find((p) => p.id === i.id)?.salePrice
        await tx.requestItem.update({ where: { id: i.id }, data: { salePrice: manual ?? salePrice(num(i.unitCost), b.markupPct) } })
      }
      await tx.request.update({ where: { id }, data: { markupPct: b.markupPct } })
      await this.move(tx, u, r, 'CUSTOMER_APPROVAL', 'review', b.comment)
    })
    return this.done(u, id)
  }

  async customerDecision(u: AuthUser, id: string, b: { approved: boolean; comment?: string | null }) {
    this.require(u, 'requests.sell')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['CUSTOMER_APPROVAL'])
      await this.move(tx, u, r, b.approved ? 'CONTRACT' : 'REVIEW', b.approved ? 'customer-approved' : 'customer-rejected', b.comment)
    })
    return this.done(u, id)
  }

  async createContract(u: AuthUser, id: string, b: { templateId?: string | null; deadlineDays?: number; advancePct?: number }) {
    this.require(u, 'requests.contract')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['CONTRACT'])
      const s = await getSettings(tx)
      const template = b.templateId
        ? await tx.contractTemplate.findUniqueOrThrow({ where: { id: b.templateId } })
        : await tx.contractTemplate.findFirst({ where: { isDefault: true } })
      const advancePct = b.advancePct ?? num(r.advancePct)
      const deadlineDays = b.deadlineDays ?? s.deadlineDays
      const unpriced = r.items.filter((i) => i.salePrice === null || num(i.salePrice) <= 0)
      if (unpriced.length) throw new BusinessError(`Narxi yo'q qatorlar: ${unpriced.map((i) => i.name).join(', ')}`)
      if (!r.customer.name.trim()) throw new BusinessError("Mijoz nomi bo'sh")
      if (r.customer.type === 'legal' && !r.customer.inn?.trim()) throw new BusinessError("Yuridik shaxs mijozning INN raqami kiritilmagan (shartnoma uchun kerak)")
      const t = totals({ ...r, advancePct: new Prisma.Decimal(advancePct) })
      const number = r.contract?.number ?? (await nextNumber(tx, 'SHR'))
      const body = renderTemplate(template?.body ?? DEFAULT_CONTRACT_TEMPLATE, {
        number, date: fmtDate(new Date()), company: s.company, customer: r.customer, total: fmtMoney(t.totalPrice), ...amountWords(t.totalPrice),
        advancePct, advanceAmount: fmtMoney(t.advanceAmount), deadlineDays,
        itemsTable: itemsTable(r.items.map((i) => ({ name: i.name, qty: num(i.qty), unit: i.unit, price: num(i.salePrice) }))),
      })
      const data = { templateId: template?.id, body, amount: t.totalPrice, advancePct, deadlineDays, status: 'draft' }
      await tx.contract.upsert({ where: { requestId: id }, create: { ...data, number, requestId: id }, update: data })
      await tx.request.update({ where: { id }, data: { advancePct } })
      await this.event(tx, u, id, 'contract-created', number)
    })
    return this.done(u, id)
  }

  /** Signed contract books the customer's debt and waits for the advance payment. */
  async signContract(u: AuthUser, id: string) {
    this.require(u, 'requests.contract')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['CONTRACT'])
      if (!r.contract) throw new BusinessError('Avval shartnoma yarating')
      await tx.contract.update({ where: { requestId: id }, data: { status: 'signed', signedAt: new Date() } })
      await tx.customer.update({ where: { id: r.customerId }, data: { debt: { increment: num(r.contract.amount) }, totalPurchases: { increment: num(r.contract.amount) } } })
      await tx.request.update({ where: { id }, data: { deadline: new Date(Date.now() + r.contract.deadlineDays * 86_400_000) } })
      await this.move(tx, u, r, 'ADVANCE_PAYMENT', 'contract-signed', r.contract.number)
    })
    return this.done(u, id)
  }

  /** Accountant confirms the advance. "Ungacha hech nima ish bajarilmaydi." */
  async confirmAdvance(u: AuthUser, id: string, comment?: string | null) {
    this.require(u, 'requests.advance')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['ADVANCE_PAYMENT'])
      const t = totals(r)
      if (num(r.paid) + 0.001 < t.advanceAmount) {
        throw new BusinessError(`Avans yetarli emas: to'langan ${fmtMoney(num(r.paid))}, kerak ${fmtMoney(t.advanceAmount)}`)
      }
      const anyPurchase = r.items.some((i) => i.source === 'purchase')
      await this.move(tx, u, r, anyPurchase ? 'PROCUREMENT' : 'ASSEMBLY', 'advance-confirmed', comment)
    })
    return this.done(u, id)
  }

  /** Procurement: supplier, actual price, logistics and other costs per purchased line. */
  async saveProcurement(u: AuthUser, id: string, b: { items: { id: string; supplierId?: string | null; actualPrice?: number; actualLogistics?: number; otherCosts?: number }[] }) {
    this.require(u, 'requests.procure')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['PROCUREMENT'])
      const supplierIds = [...new Set(b.items.map((p) => p.supplierId).filter((x): x is string => !!x))]
      const found = await tx.supplier.count({ where: { id: { in: supplierIds }, isActive: true } })
      if (found !== supplierIds.length) throw new BusinessError('Yetkazuvchi topilmadi yoki nofaol')
      for (const p of b.items) {
        const item = r.items.find((i) => i.id === p.id && i.source === 'purchase')
        if (!item) throw new BusinessError('Qator topilmadi')
        const { id: _id, ...data } = p
        await tx.requestItem.update({ where: { id: item.id }, data })
      }
      await this.event(tx, u, id, 'procurement')
    })
    return this.done(u, id)
  }

  async submitProcurement(u: AuthUser, id: string, comment?: string | null) {
    this.require(u, 'requests.procure')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['PROCUREMENT'])
      for (const i of r.items.filter((x) => x.source === 'purchase')) {
        if (!i.supplierId || i.actualPrice === null || num(i.actualPrice) <= 0) throw new BusinessError(`"${i.name}" uchun yetkazuvchi va narx kiritilmagan`)
      }
      await this.move(tx, u, r, 'PROCUREMENT_APPROVAL', 'submit-procurement', comment)
    })
    return this.done(u, id)
  }

  async procurementDecision(u: AuthUser, id: string, b: { approved: boolean; comment?: string | null }) {
    this.require(u, 'requests.approve_procurement')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['PROCUREMENT_APPROVAL'])
      await this.move(tx, u, r, b.approved ? 'RECEIVING' : 'PROCUREMENT', b.approved ? 'procurement-approved' : 'procurement-rejected', b.comment)
    })
    return this.done(u, id)
  }

  /** Storekeeper receives purchased goods: one purchase order per supplier (stock in, supplier debt, invoice). */
  async receive(u: AuthUser, id: string, comment?: string | null) {
    this.require(u, 'requests.receive')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['RECEIVING'])
      const wh = await tx.warehouse.findUniqueOrThrow({ where: { id: r.warehouseId! } })
      const bySupplier = new Map<string, Item[]>()
      for (const i of r.items.filter((x) => x.source === 'purchase')) bySupplier.set(i.supplierId!, [...(bySupplier.get(i.supplierId!) ?? []), i])
      for (const [supplierId, lines] of bySupplier) {
        const items: DocItem[] = lines.map((i) => {
          const price = actualUnitCost(i)
          return { productId: i.productId!, productName: i.name, unit: i.unit, qty: num(i.qty), price, discount: 0, sum: Math.round(price * num(i.qty)) }
        })
        const po = await tx.purchaseOrder.create({ data: {
          number: await nextNumber(tx, 'XAR'), date: new Date(), supplierId, warehouseId: wh.id, warehouseName: wh.name,
          items: items as unknown as Prisma.InputJsonValue, total: items.reduce((s, i) => s + i.sum, 0), notes: r.number,
          requestId: r.id, createdById: u.id,
        } })
        await this.finance.confirmPurchase(tx, po.id, u.id)
        for (const i of lines) await tx.requestItem.update({ where: { id: i.id }, data: { receivedQty: i.qty, unitCost: actualUnitCost(i) } })
      }
      await this.move(tx, u, r, 'ASSEMBLY', 'received', comment)
    })
    return this.done(u, id)
  }

  /** Engineer takes parts from the warehouse (sign -1) or returns them (sign 1). */
  async issue(u: AuthUser, id: string, b: { itemId: string; qty: number }, sign: -1 | 1) {
    this.require(u, 'requests.assemble')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['ASSEMBLY'])
      const item = r.items.find((i) => i.id === b.itemId)
      if (!item) throw new BusinessError('Qator topilmadi')
      if (!item.productId) throw new BusinessError(`"${item.name}" katalogdagi mahsulotga bog'lanmagan`)
      const issued = num(item.issuedQty)
      if (sign < 0 && issued + b.qty > num(item.qty) + 1e-9) throw new BusinessError(`Kerakli miqdordan ko'p: ${item.name}`)
      if (sign > 0 && b.qty > issued + 1e-9) throw new BusinessError(`Berilgandan ko'p qaytarib bo'lmaydi: ${item.name}`)
      const cost = await this.stock.costOf(tx, r.warehouseId!, item.productId)
      await this.stock.apply(tx, r.warehouseId!, [{ productId: item.productId, productName: item.name, qty: b.qty, unitCost: cost }], sign)
      await this.stock.movement(tx, {
        type: sign < 0 ? 'dispatch' : 'receipt', ...(sign < 0 ? { fromWarehouseId: r.warehouseId! } : { toWarehouseId: r.warehouseId! }),
        items: [{ productId: item.productId, productName: item.name, unit: item.unit, qty: b.qty, price: cost, sum: cost * b.qty }],
        notes: `${r.number} ${sign < 0 ? "(yig'ish uchun)" : '(qaytarildi)'}`, requestId: r.id, createdById: u.id,
      })
      await tx.requestItem.update({ where: { id: item.id }, data: { issuedQty: issued - sign * b.qty } })
      await this.event(tx, u, id, sign < 0 ? 'issue' : 'return', `${item.name} × ${b.qty}`)
    })
    return this.done(u, id)
  }

  async finishAssembly(u: AuthUser, id: string, comment?: string | null) {
    this.require(u, 'requests.assemble')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['ASSEMBLY'])
      const missing = r.items.filter((i) => num(i.issuedQty) + 1e-9 < num(i.qty))
      if (missing.length) throw new BusinessError(`Hali olinmagan qismlar: ${missing.map((i) => i.name).join(', ')}`)
      await this.move(tx, u, r, 'ACT', 'assembled', comment)
    })
    return this.done(u, id)
  }

  async createAct(u: AuthUser, id: string, comment?: string | null) {
    this.require(u, 'requests.act')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['ACT'])
      const s = await getSettings(tx)
      const t = totals(r)
      const number = await nextNumber(tx, 'AKT')
      const body = renderTemplate(DEFAULT_ACT_TEMPLATE, {
        number, date: fmtDate(new Date()), company: s.company, customer: r.customer, contractNumber: r.contract?.number ?? '',
        total: fmtMoney(t.totalPrice), ...amountWords(t.totalPrice), paid: fmtMoney(num(r.paid)), balance: fmtMoney(t.balance),
        itemsTable: itemsTable(r.items.map((i) => ({ name: i.name, qty: num(i.qty), unit: i.unit, price: num(i.salePrice) }))),
      })
      await tx.act.create({ data: { number, requestId: id, body } })
      await this.move(tx, u, r, 'DELIVERY', 'act-created', comment ?? number)
    })
    return this.done(u, id)
  }

  async deliver(u: AuthUser, id: string, comment?: string | null) {
    this.require(u, 'requests.deliver')
    await this.run(async (tx) => {
      const r = await this.load(tx, id, ['DELIVERY'])
      await this.move(tx, u, r, 'COMPLETED', 'delivered', comment)
    })
    return this.done(u, id)
  }

  /** Cancels a request: issued parts go back to stock and a signed contract's debt is reversed. */
  async cancel(u: AuthUser, id: string, comment?: string | null) {
    this.require(u, 'requests.cancel')
    await this.run(async (tx) => {
      const r = await tx.request.findUniqueOrThrow({ where: { id }, include: full })
      if (FINAL_STATUSES.includes(r.status)) throw new BusinessError('Zayavka allaqachon yopilgan')
      for (const i of r.items.filter((x) => num(x.issuedQty) > 0 && x.productId)) {
        await this.stock.apply(tx, r.warehouseId!, [{ productId: i.productId!, qty: num(i.issuedQty), unitCost: await this.stock.costOf(tx, r.warehouseId!, i.productId!) }], 1)
        await tx.requestItem.update({ where: { id: i.id }, data: { issuedQty: 0 } })
      }
      if (r.contract?.status === 'signed') {
        await tx.customer.update({ where: { id: r.customerId }, data: { debt: { decrement: num(r.contract.amount) }, totalPurchases: { decrement: num(r.contract.amount) } } })
      }
      await this.move(tx, u, r, 'CANCELLED', 'cancel', comment)
    })
    return this.done(u, id)
  }
}
