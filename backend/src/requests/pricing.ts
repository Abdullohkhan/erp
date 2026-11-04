/** Landed-cost calculation used by the declarant (per unit, UZS). */
export interface PricingInput {
  qty: number
  purchasePrice: number
  customsDutyPct: number
  vatPct: number
  excisePct: number
  /** Line totals (spread over qty) */
  customsFee: number
  certificateCost: number
  labCost: number
  serviceFee: number
  logisticsCost: number
}

/** Money is kept in whole so'm. */
const r2 = (n: number) => Math.round(n)

export function unitCost(p: PricingInput): number {
  const base = p.purchasePrice
  const duty = (base * p.customsDutyPct) / 100
  const excise = ((base + duty) * p.excisePct) / 100
  const vat = ((base + duty + excise) * p.vatPct) / 100
  const fixed = p.qty > 0 ? (p.customsFee + p.certificateCost + p.labCost + p.serviceFee + p.logisticsCost) / p.qty : 0
  return r2(base + duty + excise + vat + fixed)
}

export const salePrice = (cost: number, markupPct: number) => r2(cost * (1 + markupPct / 100))
export const advanceAmount = (total: number, pct: number) => r2((total * pct) / 100)
