import { Injectable } from '@nestjs/common'
import type { Tx } from '../common/prisma.service.js'
import { OWNER_ROLE, type Permission } from '../auth/permissions.js'

@Injectable()
export class NotificationsService {
  /** Notifies every active user whose role explicitly has one of the permissions (each user once) (owners see everything anyway). */
  async toPermission(tx: Tx, perm: Permission | Permission[], title: string, body: string | null, link: string, exceptUserId?: string | string[]) {
    const perms = Array.isArray(perm) ? perm : [perm]
    const except = (Array.isArray(exceptUserId) ? exceptUserId : [exceptUserId]).filter((x): x is string => !!x)
    const users = await tx.user.findMany({
      where: { isActive: true, role: { permissions: { hasSome: perms }, key: { not: OWNER_ROLE } }, ...(except.length ? { id: { notIn: except } } : {}) },
      select: { id: true },
    })
    if (users.length) await tx.notification.createMany({ data: users.map((u) => ({ userId: u.id, title, body, link })) })
  }

  async toUser(tx: Tx, userId: string, title: string, body: string | null, link: string) {
    await tx.notification.create({ data: { userId, title, body, link } })
  }
}
