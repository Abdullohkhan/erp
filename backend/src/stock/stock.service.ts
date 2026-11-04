import { Injectable } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client.js'
import type { Tx } from '../common/prisma.service.js'
import { BusinessError } from '../common/errors.js'
import { nextNumber } from '../common/numbering.js'
import { num } from '../common/serialize.js'

export interface DocItem {
  productId: string
  productName: string
  unit: string
  qty: number
  price: number
  discount?: number
  sum: number
  salePrice?: number
}

export interface StockLine {
  productId: string
  productName?: string
  qty: number
  /** Unit cost of incoming goods; re-averages the cost price. */
  unitCost?: number
}

/** All stock changes go through here, inside the caller's transaction. */
@Injectable()
export class StockService {
  /** Adds (sign 1) or removes (sign -1) goods. Throws before writing anything if stock is insufficient. */
  async apply(tx: Tx, warehouseId: string, lines: StockLine[], sign: 1 | -1) {
    const merged = new Map<string, StockLine>()
    for (const l of lines) {
      const cur = merged.get(l.productId)
      if (cur) {
        const q = cur.qty + l.qty
        cur.unitCost = l.unitCost !== undefined && cur.unitCost !== undefined ? (cur.qty * cur.unitCost + l.qty * l.unitCost) / q : cur.unitCost ?? l.unitCost
        cur.qty = q
      } else merged.set(l.productId, { ...l })
    }
    const plan: { id?: string; productId: string; qty: number; costPrice: number }[] = []
    // Fixed lock order (by product id) so two documents with the same products cannot deadlock.
    for (const l of [...merged.values()].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0))) {
      // Lock the row so concurrent documents cannot oversell.
      const rows = await tx.$queryRaw<{ id: string; qty: Prisma.Decimal; reservedQty: Prisma.Decimal; costPrice: Prisma.Decimal }[]>`
        SELECT id, qty, "reservedQty", "costPrice" FROM "StockBalance"
        WHERE "warehouseId" = ${warehouseId} AND "productId" = ${l.productId} FOR UPDATE`
      const rec = rows[0]
      const qty = num(rec?.qty)
      const available = qty - num(rec?.reservedQty)
      if (sign < 0 && l.qty > available + 1e-9) {
        const p = l.productName ?? (await tx.product.findUnique({ where: { id: l.productId } }))?.name ?? l.productId
        throw new BusinessError(`Omborda yetarli tovar yo'q: ${p} (mavjud ${available}, kerak ${l.qty})`)
      }
      const newQty = qty + sign * l.qty
      let cost = num(rec?.costPrice)
      if (sign > 0 && l.unitCost !== undefined) cost = newQty > 0 ? Math.round(((qty * cost) + l.qty * l.unitCost) / newQty * 100) / 100 : l.unitCost
      plan.push({ id: rec?.id, productId: l.productId, qty: newQty, costPrice: cost })
    }
    for (const p of plan) {
      if (p.id) await tx.stockBalance.update({ where: { id: p.id }, data: { qty: p.qty, costPrice: p.costPrice } })
      else await tx.stockBalance.create({ data: { warehouseId, productId: p.productId, qty: p.qty, costPrice: p.costPrice } })
    }
  }

  /**
   * Locks the balance rows of the given products (sorted, `FOR UPDATE`) and returns them by product id.
   * Missing rows are simply absent (nothing on stock).
   */
  async lock(tx: Tx, warehouseId: string, productIds: string[]) {
    const ids = [...new Set(productIds)].sort()
    const out = new Map<string, { id: string; qty: number; reservedQty: number }>()
    if (!ids.length) return out
    const rows = await tx.$queryRaw<{ id: string; productId: string; qty: Prisma.Decimal; reservedQty: Prisma.Decimal }[]>`
      SELECT id, "productId", qty, "reservedQty" FROM "StockBalance"
      WHERE "warehouseId" = ${warehouseId} AND "productId" = ANY(${ids}::text[]) ORDER BY "productId" FOR UPDATE`
    for (const r of rows) out.set(r.productId, { id: r.id, qty: num(r.qty), reservedQty: num(r.reservedQty) })
    return out
  }

  /**
   * Reserves (qty > 0) or releases (qty < 0) goods for a request. Reserving more than the free quantity
   * (qty − reservedQty) throws, so goods held by one request cannot be taken by another one.
   */
  async reserve(tx: Tx, warehouseId: string, productId: string, qty: number, productName?: string) {
    if (Math.abs(qty) < 1e-9) return
    const rec = (await this.lock(tx, warehouseId, [productId])).get(productId)
    if (qty > 0) {
      const available = (rec?.qty ?? 0) - (rec?.reservedQty ?? 0)
      if (!rec || qty > available + 1e-9) {
        const p = productName ?? (await tx.product.findUnique({ where: { id: productId } }))?.name ?? productId
        throw new BusinessError(`Omborda band qilish uchun yetarli tovar yo'q: ${p} (mavjud ${Math.max(0, available)}, kerak ${qty})`)
      }
      await tx.stockBalance.update({ where: { id: rec.id }, data: { reservedQty: rec.reservedQty + qty } })
    } else if (rec) {
      await tx.stockBalance.update({ where: { id: rec.id }, data: { reservedQty: Math.max(0, rec.reservedQty + qty) } })
    }
  }

  async movement(tx: Tx, data: {
    type: string; date?: Date; fromWarehouseId?: string; toWarehouseId?: string; items: DocItem[]
    notes?: string | null; requestId?: string; createdById?: string
  }) {
    const names = async (id?: string) => (id ? (await tx.warehouse.findUnique({ where: { id } }))?.name : undefined)
    return tx.stockMovement.create({
      data: {
        number: await nextNumber(tx, 'HAR'), date: data.date ?? new Date(), type: data.type,
        fromWarehouseId: data.fromWarehouseId, fromWarehouseName: await names(data.fromWarehouseId),
        toWarehouseId: data.toWarehouseId, toWarehouseName: await names(data.toWarehouseId),
        items: data.items as unknown as Prisma.InputJsonValue, notes: data.notes ?? undefined,
        requestId: data.requestId, createdById: data.createdById,
      },
    })
  }

  async costOf(tx: Tx, warehouseId: string, productId: string) {
    const r = await tx.stockBalance.findUnique({ where: { warehouseId_productId: { warehouseId, productId } } })
    return num(r?.costPrice)
  }
}
