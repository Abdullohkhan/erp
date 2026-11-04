import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { z } from 'zod'
import { ZodPipe, date, money, optStr, qty, str } from '../common/zod.js'
import { CurrentUser, Perm } from '../auth/decorators.js'
import type { AuthUser } from '../auth/auth.types.js'
import { RequestsService } from './requests.service.js'
import { PIPELINE, STATUS_OWNER } from './workflow.js'

const statusEnum = z.enum(Object.keys(STATUS_OWNER) as [string, ...string[]])
const CreateDto = z.object({
  customerId: str, title: str, description: optStr, kind: z.enum(['modification', 'assembly', 'order']).default('assembly'),
  warehouseId: optStr, deadline: date.optional().nullable(),
})
const pct = z.coerce.number().min(0).max(1000)
const Comment = z.object({ comment: optStr }).default({ comment: null })

const ACTIONS = {
  comment: z.object({ comment: str }),
  take: Comment,
  configuration: z.object({
    warehouseId: optStr,
    items: z.array(z.object({ productId: optStr, name: optStr, qty, note: optStr })).min(1, "Kamida bitta qator"),
  }),
  'submit-configuration': Comment,
  pricing: z.object({ items: z.array(z.object({
    id: str, productId: optStr, tnvedCode: optStr, purchasePrice: money.optional(), customsDutyPct: pct.optional(),
    vatPct: pct.optional(), excisePct: pct.optional(), customsFee: money.optional(), certificateCost: money.optional(),
    labCost: money.optional(), serviceFee: money.optional(), logisticsCost: money.optional(),
  })) }),
  'submit-pricing': Comment,
  review: z.object({ markupPct: pct, prices: z.array(z.object({ id: str, salePrice: money })).optional(), comment: optStr }),
  'customer-decision': z.object({ approved: z.boolean(), comment: optStr }),
  contract: z.object({ templateId: optStr, deadlineDays: z.coerce.number().int().min(1).max(730).optional(), advancePct: z.coerce.number().min(0).max(100).optional() }),
  'sign-contract': Comment,
  'confirm-advance': Comment,
  procurement: z.object({ items: z.array(z.object({
    id: str, supplierId: optStr, actualPrice: money.optional(), actualLogistics: money.optional(), otherCosts: money.optional(),
  })) }),
  'submit-procurement': Comment,
  'procurement-decision': z.object({ approved: z.boolean(), comment: optStr }),
  receive: Comment,
  issue: z.object({ itemId: str, qty }),
  return: z.object({ itemId: str, qty }),
  'finish-assembly': Comment,
  act: Comment,
  deliver: z.object({ comment: z.string().trim().min(1, 'Kim qabul qilganini yozing') }),
  cancel: z.object({ comment: str }),
} as const
type ActionName = keyof typeof ACTIONS

@ApiTags('requests')
@Controller('requests')
export class RequestsController {
  constructor(private svc: RequestsService) {}

  /** Status catalog: label, responsible permission and pipeline order. */
  @Get('statuses') @Perm('requests.view')
  statuses() {
    return { pipeline: PIPELINE, statuses: STATUS_OWNER }
  }

  @Get() @Perm('requests.view')
  list(@CurrentUser() u: AuthUser, @Query('status') status?: string, @Query('mine') mine?: string) {
    const s = status ? statusEnum.parse(status) : undefined
    return this.svc.list(u, { status: s as never, mine: mine === 'true' })
  }

  @Get(':id') @Perm('requests.view')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u, id)
  }

  @Post() @Perm('requests.create')
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(CreateDto)) b: z.infer<typeof CreateDto>) {
    return this.svc.create(u, b)
  }

  /** Every workflow step is POST /requests/:id/<action>; the service checks status and permission. */
  @Post(':id/:action') @Perm('requests.view')
  async action(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('action') action: string, @Body() raw: unknown) {
    if (!(action in ACTIONS)) throw new BadRequestException("Noma'lum amal")
    // Each schema above matches the service method it is dispatched to.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = new ZodPipe(ACTIONS[action as ActionName]).transform(raw ?? {}) as any
    const s = this.svc
    switch (action as ActionName) {
      case 'comment': return s.comment(u, id, b.comment)
      case 'take': return s.take(u, id, b.comment)
      case 'configuration': return s.saveConfiguration(u, id, b)
      case 'submit-configuration': return s.submitConfiguration(u, id, b.comment)
      case 'pricing': return s.savePricing(u, id, b)
      case 'submit-pricing': return s.submitPricing(u, id, b.comment)
      case 'review': return s.review(u, id, b)
      case 'customer-decision': return s.customerDecision(u, id, b)
      case 'contract': return s.createContract(u, id, b)
      case 'sign-contract': return s.signContract(u, id)
      case 'confirm-advance': return s.confirmAdvance(u, id, b.comment)
      case 'procurement': return s.saveProcurement(u, id, b)
      case 'submit-procurement': return s.submitProcurement(u, id, b.comment)
      case 'procurement-decision': return s.procurementDecision(u, id, b)
      case 'receive': return s.receive(u, id, b.comment)
      case 'issue': return s.issue(u, id, b, -1)
      case 'return': return s.issue(u, id, b, 1)
      case 'finish-assembly': return s.finishAssembly(u, id, b.comment)
      case 'act': return s.createAct(u, id, b.comment)
      case 'deliver': return s.deliver(u, id, b.comment)
      case 'cancel': return s.cancel(u, id, b.comment)
    }
  }
}
