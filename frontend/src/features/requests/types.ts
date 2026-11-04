export type RequestStatus =
  | 'NEW' | 'CONFIGURATION' | 'PRICING' | 'REVIEW' | 'CUSTOMER_APPROVAL' | 'CONTRACT' | 'ADVANCE_PAYMENT'
  | 'PROCUREMENT' | 'PROCUREMENT_APPROVAL' | 'RECEIVING' | 'ASSEMBLY' | 'ACT' | 'DELIVERY' | 'COMPLETED' | 'CANCELLED'

export const PIPELINE: RequestStatus[] = [
  'NEW', 'CONFIGURATION', 'PRICING', 'REVIEW', 'CUSTOMER_APPROVAL', 'CONTRACT', 'ADVANCE_PAYMENT',
  'PROCUREMENT', 'PROCUREMENT_APPROVAL', 'RECEIVING', 'ASSEMBLY', 'ACT', 'DELIVERY', 'COMPLETED',
]

/** Labels are Uzbek translation keys. `perm` = who acts at this stage. */
export const STATUS_INFO: Record<RequestStatus, { label: string; short: string; perm: string | null; color: 'default' | 'primary' | 'secondary' | 'info' | 'warning' | 'success' | 'error' }> = {
  NEW: { label: 'Yangi', short: 'Yangi', perm: 'requests.configure', color: 'info' },
  CONFIGURATION: { label: 'Injener ishlamoqda (konfiguratsiya)', short: 'Konfiguratsiya', perm: 'requests.configure', color: 'primary' },
  PRICING: { label: 'Narx shakllantirish (deklarant)', short: 'Narx', perm: 'requests.price', color: 'secondary' },
  REVIEW: { label: "Narxni ko'rib chiqish", short: "Ko'rib chiqish", perm: 'requests.review', color: 'secondary' },
  CUSTOMER_APPROVAL: { label: "Buyurtmachi tasdig'i", short: 'Buyurtmachi', perm: 'requests.sell', color: 'warning' },
  CONTRACT: { label: 'Shartnoma', short: 'Shartnoma', perm: 'requests.contract', color: 'warning' },
  ADVANCE_PAYMENT: { label: "Avans to'lovi", short: 'Avans', perm: 'requests.advance', color: 'warning' },
  PROCUREMENT: { label: "Ta'minot", short: "Ta'minot", perm: 'requests.procure', color: 'primary' },
  PROCUREMENT_APPROVAL: { label: "Ta'minotni tasdiqlash", short: 'Tasdiq', perm: 'requests.approve_procurement', color: 'warning' },
  RECEIVING: { label: 'Omborga qabul', short: 'Qabul', perm: 'requests.receive', color: 'primary' },
  ASSEMBLY: { label: "Yig'ish (injener)", short: "Yig'ish", perm: 'requests.assemble', color: 'primary' },
  ACT: { label: 'Dalolatnoma', short: 'Akt', perm: 'requests.act', color: 'info' },
  DELIVERY: { label: 'Yetkazib berish', short: 'Yetkazish', perm: 'requests.deliver', color: 'info' },
  COMPLETED: { label: 'Yakunlangan', short: 'Yakunlangan', perm: null, color: 'success' },
  CANCELLED: { label: 'Bekor qilingan', short: 'Bekor', perm: null, color: 'error' },
}

export const REQUEST_KINDS: Record<string, string> = {
  modification: "O'zgartirish", assembly: "Butlovchilardan yig'ish", order: 'Buyurtma',
}

export interface RequestItem {
  id: string
  productId: string | null
  name: string
  qty: number
  unit: string
  note: string | null
  source: 'stock' | 'purchase'
  tnvedCode?: string | null
  purchasePrice?: number | null
  customsDutyPct?: number
  vatPct?: number
  excisePct?: number
  customsFee?: number
  certificateCost?: number
  labCost?: number
  serviceFee?: number
  logisticsCost?: number
  unitCost?: number | null
  salePrice?: number | null
  supplierId?: string | null
  actualPrice?: number | null
  actualLogistics?: number
  otherCosts?: number
  receivedQty: number
  issuedQty: number
}

export interface RequestEvent {
  id: string
  fromStatus: RequestStatus | null
  toStatus: RequestStatus | null
  action: string
  comment: string | null
  userName: string
  createdAt: string
}

export interface CrmRequest {
  id: string
  number: string
  kind: string
  title: string
  description: string | null
  status: RequestStatus
  customerId: string
  customer: { id: string; name: string; phone: string; inn: string | null; address: string | null }
  warehouseId: string | null
  deadline: string | null
  markupPct?: number
  advancePct: number
  paid?: number
  createdById: string
  assigneeId: string | null
  items: RequestItem[]
  events: RequestEvent[]
  contract: { id: string; number: string; status: string; body?: string; amount?: number; advancePct?: number; deadlineDays?: number; signedAt?: string | null } | null
  act: { id: string; number: string; body?: string } | null
  totalCost?: number
  totalPrice?: number
  advanceAmount?: number
  balance?: number
  createdAt: string
  updatedAt: string
}

export interface RequestRow {
  id: string
  number: string
  kind: string
  title: string
  status: RequestStatus
  customerName: string
  deadline: string | null
  assigneeId: string | null
  createdById: string
  itemCount: number
  missingCount: number
  totalPrice?: number
  paid?: number
  updatedAt: string
}

/** Same landed-cost formula as backend/src/requests/pricing.ts (for live preview only). */
export function unitCost(i: Pick<RequestItem, 'qty'> & Partial<RequestItem>): number | null {
  if (i.purchasePrice === null || i.purchasePrice === undefined || Number.isNaN(i.purchasePrice)) return null
  const base = Number(i.purchasePrice)
  const duty = (base * (i.customsDutyPct ?? 0)) / 100
  const excise = ((base + duty) * (i.excisePct ?? 0)) / 100
  const vat = ((base + duty + excise) * (i.vatPct ?? 0)) / 100
  const fixed = i.qty > 0 ? ((i.customsFee ?? 0) + (i.certificateCost ?? 0) + (i.labCost ?? 0) + (i.serviceFee ?? 0) + (i.logisticsCost ?? 0)) / i.qty : 0
  return Math.round(base + duty + excise + vat + fixed) // whole so'm, like the backend
}
