import { Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Query, Res } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { z } from 'zod'
import { PrismaService, type Tx } from '../common/prisma.service.js'
import { BusinessError } from '../common/errors.js'
import { nextNumber } from '../common/numbering.js'
import { num } from '../common/serialize.js'
import { ZodPipe, date, money, optStr, str } from '../common/zod.js'
import { CurrentUser, Perm, has } from '../auth/decorators.js'
import type { AuthUser } from '../auth/auth.types.js'
import { ALL_PERMISSIONS, OWNER_ROLE } from '../auth/permissions.js'
import type { Prisma } from '../generated/prisma/client.js'
import type { DeliveryStatus, RequestStatus } from '../generated/prisma/enums.js'
import { RequestsService } from '../requests/requests.service.js'
import { NotificationsService } from '../requests/notifications.service.js'
import { getSettings } from '../system/settings.js'
import { DEFAULT_WAYBILL_TEMPLATE, fmtDate, goodsTable, renderTemplate } from '../documents/render.js'
import { sendPdf } from '../documents/documents.controller.js'

const include = {
  request: { select: { id: true, number: true, title: true, status: true, customer: { select: { name: true, phone: true } }, items: { orderBy: { sortOrder: 'asc' }, select: { name: true, qty: true, unit: true } } } },
} as const satisfies Prisma.DeliveryInclude
type Row = Prisma.DeliveryGetPayload<{ include: typeof include }>

const Fields = {
  driverId: optStr, driverName: optStr, driverPhone: optStr, vehicleNumber: optStr,
  plannedAt: date.optional().nullable(), cost: money.optional(), notes: optStr,
}
const CreateDto = z.object({ ...Fields, address: str })
const UpdateDto = z.object({ ...Fields, address: str.optional() })
const StatusDto = z.object({
  status: z.enum(['IN_TRANSIT', 'DELIVERED', 'RETURNED']),
  receivedBy: optStr, comment: optStr,
}).refine((b) => b.status !== 'DELIVERED' || !!b.receivedBy?.trim(), { message: 'Kim qabul qilganini yozing', path: ['receivedBy'] })
  .refine((b) => b.status !== 'RETURNED' || !!b.comment?.trim(), { message: 'Qaytish sababini yozing', path: ['comment'] })

const ANY_STATUS: RequestStatus[] = ['DELIVERY', 'COMPLETED', 'CANCELLED']
const OPEN: DeliveryStatus[] = ['PLANNED', 'IN_TRANSIT']
const NEXT: Record<DeliveryStatus, DeliveryStatus[]> = {
  PLANNED: ['IN_TRANSIT', 'DELIVERED', 'RETURNED'], IN_TRANSIT: ['DELIVERED', 'RETURNED'], DELIVERED: [], RETURNED: [],
}
export const DELIVERY_LABELS: Record<DeliveryStatus, string> = { PLANNED: 'Rejada', IN_TRANSIT: "Yo'lda", DELIVERED: 'Yetkazildi', RETURNED: 'Qaytdi' }

@Injectable()
export class DeliveriesService {
  constructor(private prisma: PrismaService, private requests: RequestsService, private notify: NotificationsService) {}

  /** Dispatchers see every delivery; a driver only the ones assigned to them. */
  private seesAll = (u: AuthUser) => has(u, 'deliveries.view') || has(u, 'requests.deliver')

  /** No money for users without costs.view (drivers, engineers); items are names and quantities only. */
  present(u: AuthUser, d: Row) {
    const { cost, request, ...rest } = d
    return {
      ...rest, ...(has(u, 'costs.view') ? { cost: num(cost) } : {}),
      request: { id: request.id, number: request.number, title: request.title, status: request.status, customer: request.customer },
      items: RequestsService.goods(request.items),
    }
  }

  async list(u: AuthUser, f: { requestId?: string; status?: string }) {
    const status = f.status && f.status in NEXT ? (f.status as DeliveryStatus) : undefined
    const rows = await this.prisma.delivery.findMany({
      where: { ...(this.seesAll(u) ? {} : { driverId: u.id }), ...(f.requestId ? { requestId: f.requestId } : {}), ...(status ? { status } : {}) },
      include, orderBy: [{ plannedAt: 'desc' }, { createdAt: 'desc' }],
    })
    return rows.map((d) => this.present(u, d))
  }

  /** Loads a delivery the user may see (someone else's delivery is "not found" for a driver). */
  private async visible(u: AuthUser, id: string) {
    const d = await this.prisma.delivery.findUnique({ where: { id }, include })
    if (!d || (!this.seesAll(u) && d.driverId !== u.id)) throw new NotFoundException('Yetkazish topilmadi')
    return d
  }

  async get(u: AuthUser, id: string) {
    return this.present(u, await this.visible(u, id))
  }

  /** Driver must be an active user whose role has "deliveries.drive"; name / phone default to the user's. */
  private async driver(tx: Tx, b: { driverId?: string | null; driverName?: string | null; driverPhone?: string | null }) {
    if (!b.driverId) return { driverId: null, driverName: b.driverName?.trim() || null, driverPhone: b.driverPhone ?? null }
    const user = await tx.user.findUnique({ where: { id: b.driverId }, include: { role: true } })
    const perms = user?.role.key === OWNER_ROLE ? ALL_PERMISSIONS : user?.role.permissions ?? []
    if (!user || !user.isActive || !perms.includes('deliveries.drive')) throw new BusinessError("Haydovchi topilmadi yoki uning roli haydovchi emas")
    return { driverId: user.id, driverName: b.driverName?.trim() || user.fullName, driverPhone: b.driverPhone || user.phone }
  }

  private async lockDelivery(tx: Tx, id: string) {
    const d = await tx.delivery.findUniqueOrThrow({ where: { id } })
    await this.requests.lockRequest(tx, d.requestId, ANY_STATUS)
    await tx.$queryRaw`SELECT id FROM "Delivery" WHERE id = ${id} FOR UPDATE`
    return tx.delivery.findUniqueOrThrow({ where: { id } })
  }

  async create(u: AuthUser, requestId: string, b: z.infer<typeof CreateDto>) {
    const id = await this.prisma.$transaction(async (tx) => {
      const r = await this.requests.lockRequest(tx, requestId, ['DELIVERY'])
      if (r.deliveries.some((d) => OPEN.includes(d.status))) throw new BusinessError('Bu zayavkada tugallanmagan yetkazish bor')
      const drv = await this.driver(tx, b)
      if (!drv.driverName) throw new BusinessError('Haydovchini tanlang yoki ismini yozing')
      const d = await tx.delivery.create({ data: {
        number: await nextNumber(tx, 'YV'), requestId, ...drv, driverName: drv.driverName, vehicleNumber: b.vehicleNumber ?? undefined,
        address: b.address, plannedAt: b.plannedAt ?? undefined, cost: b.cost ?? 0, notes: b.notes ?? undefined, createdById: u.id,
      } })
      await this.requests.logEvent(tx, u, requestId, 'delivery-planned', `${d.number}: ${d.driverName}${d.vehicleNumber ? `, ${d.vehicleNumber}` : ''} → ${d.address}`)
      if (d.driverId && d.driverId !== u.id) await this.notify.toUser(tx, d.driverId, `${d.number}: yangi yetkazish`, `${r.number} · ${d.address}`, `/deliveries/${d.id}`)
      return d.id
    })
    return this.get(u, id)
  }

  async update(u: AuthUser, id: string, b: z.infer<typeof UpdateDto>) {
    await this.prisma.$transaction(async (tx) => {
      const d = await this.lockDelivery(tx, id)
      if (!OPEN.includes(d.status)) throw new BusinessError("Yakunlangan yetkazishni o'zgartirib bo'lmaydi")
      const drv: { driverId?: string | null; driverName?: string | null; driverPhone?: string | null } =
        b.driverId !== undefined || b.driverName !== undefined ? await this.driver(tx, { driverId: b.driverId, driverName: b.driverName ?? d.driverName, driverPhone: b.driverPhone }) : {}
      const { driverId: _d, driverName: _n, driverPhone: _p, ...rest } = b
      await tx.delivery.update({ where: { id }, data: {
        ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)), ...(b.driverPhone !== undefined ? { driverPhone: b.driverPhone } : {}), ...drv,
      } as Prisma.DeliveryUncheckedUpdateInput })
      if (drv.driverId && drv.driverId !== d.driverId) {
        await this.notify.toUser(tx, drv.driverId, `${d.number}: yangi yetkazish`, d.address, `/deliveries/${d.id}`)
      }
    })
    return this.get(u, id)
  }

  /** In transit / delivered / returned. The assigned driver may do it too; "delivered" completes the request. */
  async setStatus(u: AuthUser, id: string, b: z.infer<typeof StatusDto>) {
    await this.prisma.$transaction(async (tx) => {
      const d = await this.lockDelivery(tx, id)
      const isDriver = !!d.driverId && d.driverId === u.id && has(u, 'deliveries.drive')
      if (!has(u, 'requests.deliver') && !isDriver) {
        // Another driver's delivery does not exist for this driver.
        if (!this.seesAll(u)) throw new NotFoundException('Yetkazish topilmadi')
        throw new ForbiddenException("Bu amal uchun ruxsat yo'q")
      }
      if (!NEXT[d.status].includes(b.status)) throw new BusinessError(`Yetkazish holati "${DELIVERY_LABELS[d.status]}" — "${DELIVERY_LABELS[b.status]}" ga o'tkazib bo'lmaydi`)
      const now = new Date()
      await tx.delivery.update({ where: { id }, data: {
        status: b.status,
        ...(b.status === 'IN_TRANSIT' ? { departedAt: now } : {}),
        ...(b.status === 'DELIVERED' ? { deliveredAt: now, receivedBy: b.receivedBy!.trim() } : {}),
        ...(b.comment ? { notes: [d.notes, b.comment].filter(Boolean).join('\n') } : {}),
      } })
      const r = await this.requests.lockRequest(tx, d.requestId, ANY_STATUS)
      const text = `${d.number}: ${DELIVERY_LABELS[b.status]}${b.receivedBy ? ` — ${b.receivedBy}` : ''}${b.comment ? ` (${b.comment})` : ''}`
      if (b.status === 'DELIVERED' && r.status === 'DELIVERY') {
        await this.requests.logEvent(tx, u, r.id, 'delivery-status', text)
        await this.requests.completeDelivery(tx, u, r, b.receivedBy!.trim(), d.id)
      } else {
        await this.requests.logEvent(tx, u, r.id, 'delivery-status', text)
        await this.notify.toPermission(tx, 'requests.deliver', text, r.number, `/requests/${r.id}`, u.id)
      }
    })
    return this.get(u, id)
  }

  drivers() {
    return this.prisma.user.findMany({
      where: { isActive: true, role: { OR: [{ permissions: { has: 'deliveries.drive' } }, { key: OWNER_ROLE }] } },
      select: { id: true, fullName: true, phone: true }, orderBy: { fullName: 'asc' },
    })
  }

  async waybill(u: AuthUser, id: string) {
    const d = await this.visible(u, id)
    const s = await getSettings(this.prisma)
    const when = (x: Date | null) => (x ? `${fmtDate(x)} ${x.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : '')
    const html = renderTemplate(DEFAULT_WAYBILL_TEMPLATE, {
      number: d.number, date: fmtDate(new Date()), requestNumber: d.request.number, company: s.company, customer: d.request.customer,
      address: d.address, driverName: d.driverName, driverPhone: d.driverPhone ?? '', vehicleNumber: d.vehicleNumber ?? '',
      plannedAt: when(d.plannedAt), deliveredAt: when(d.deliveredAt), notes: d.notes ?? '',
      itemsTable: goodsTable(RequestsService.goods(d.request.items)),
    })
    return { number: d.number, html }
  }
}

@ApiTags('deliveries')
@Controller()
export class DeliveriesController {
  constructor(private svc: DeliveriesService) {}

  @Get('deliveries') @Perm('deliveries.view', 'deliveries.drive', 'requests.deliver')
  list(@CurrentUser() u: AuthUser, @Query('requestId') requestId?: string, @Query('status') status?: string) {
    return this.svc.list(u, { requestId, status })
  }

  @Get('deliveries/:id') @Perm('deliveries.view', 'deliveries.drive', 'requests.deliver')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u, id)
  }

  /** Users who can be assigned as drivers (role has "deliveries.drive"). */
  @Get('drivers') @Perm('requests.deliver')
  drivers() {
    return this.svc.drivers()
  }

  @Post('requests/:id/deliveries') @Perm('requests.deliver')
  create(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(CreateDto)) b: z.infer<typeof CreateDto>) {
    return this.svc.create(u, id, b)
  }

  @Patch('deliveries/:id') @Perm('requests.deliver')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(UpdateDto)) b: z.infer<typeof UpdateDto>) {
    return this.svc.update(u, id, b)
  }

  @Post('deliveries/:id/status') @Perm('requests.deliver', 'deliveries.drive')
  status(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(StatusDto)) b: z.infer<typeof StatusDto>) {
    return this.svc.setStatus(u, id, b)
  }

  @Get('deliveries/:id/waybill') @Perm('deliveries.view', 'deliveries.drive', 'requests.deliver')
  waybill(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.waybill(u, id)
  }

  @Get('deliveries/:id/waybill/pdf') @Perm('deliveries.view', 'deliveries.drive', 'requests.deliver')
  async waybillPdf(@CurrentUser() u: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const w = await this.svc.waybill(u, id)
    await sendPdf(res, `Yol-varaqasi-${w.number}.pdf`, w.html, `Yo'l varaqasi ${w.number}`)
  }
}
