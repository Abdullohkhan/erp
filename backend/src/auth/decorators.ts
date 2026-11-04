import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common'
import type { Permission } from './permissions.js'
import type { AuthUser } from './auth.types.js'

export const IS_PUBLIC = 'isPublic'
export const PERMS = 'permissions'

/** Endpoint is reachable without a token. */
export const Public = () => SetMetadata(IS_PUBLIC, true)

/** User needs at least ONE of the listed permissions. */
export const Perm = (...perms: Permission[]) => SetMetadata(PERMS, perms)

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser =>
  ctx.switchToHttp().getRequest<{ user: AuthUser }>().user)

export const has = (user: AuthUser, perm: Permission) => user.permissions.includes(perm)

/** Permissions that imply working with sale prices. A user with none of them (e.g. the engineer) never receives prices. */
const PRICE_PERMS: Permission[] = [
  'costs.view', 'requests.review', 'requests.sell', 'requests.contract', 'requests.act', 'requests.advance', 'payments.view',
  'sales.view', 'sales.create', 'purchases.view', 'invoices.view', 'products.manage',
]
export const canSeePrices = (user: AuthUser) => PRICE_PERMS.some((p) => has(user, p))
