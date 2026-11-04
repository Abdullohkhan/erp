import type { Permission } from '../auth/permissions.js'
import type { RequestStatus } from '../generated/prisma/enums.js'

/** Who is responsible for a request in each status (their users get notified). */
export const STATUS_OWNER: Record<RequestStatus, { perm: Permission | null; label: string }> = {
  NEW: { perm: 'requests.configure', label: 'Yangi' },
  CONFIGURATION: { perm: 'requests.configure', label: 'Injener ishlamoqda (konfiguratsiya)' },
  PRICING: { perm: 'requests.price', label: 'Narx shakllantirish (deklarant)' },
  REVIEW: { perm: 'requests.review', label: "Narxni ko'rib chiqish" },
  CUSTOMER_APPROVAL: { perm: 'requests.sell', label: 'Buyurtmachi tasdig\'i' },
  CONTRACT: { perm: 'requests.contract', label: 'Shartnoma' },
  ADVANCE_PAYMENT: { perm: 'requests.advance', label: "Avans to'lovi" },
  PROCUREMENT: { perm: 'requests.procure', label: "Ta'minot" },
  PROCUREMENT_APPROVAL: { perm: 'requests.approve_procurement', label: "Ta'minotni tasdiqlash" },
  RECEIVING: { perm: 'requests.receive', label: 'Omborga qabul' },
  ASSEMBLY: { perm: 'requests.assemble', label: "Yig'ish (injener)" },
  ACT: { perm: 'requests.act', label: 'Dalolatnoma' },
  DELIVERY: { perm: 'requests.deliver', label: 'Yetkazib berish' },
  COMPLETED: { perm: null, label: 'Yakunlangan' },
  CANCELLED: { perm: null, label: 'Bekor qilingan' },
}

export const FINAL_STATUSES: RequestStatus[] = ['COMPLETED', 'CANCELLED']

/** Ordered pipeline used for progress bars on the frontend. */
export const PIPELINE: RequestStatus[] = [
  'NEW', 'CONFIGURATION', 'PRICING', 'REVIEW', 'CUSTOMER_APPROVAL', 'CONTRACT', 'ADVANCE_PAYMENT',
  'PROCUREMENT', 'PROCUREMENT_APPROVAL', 'RECEIVING', 'ASSEMBLY', 'ACT', 'DELIVERY', 'COMPLETED',
]
