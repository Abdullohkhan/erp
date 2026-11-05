/**
 * Seeds roles, the first owner account, default settings / contract template and (when the
 * database is empty) demo data from prisma/seed-data.json. Safe to run repeatedly.
 *
 *   SEED_OWNER_USERNAME / SEED_OWNER_PASSWORD – first owner (required on first run)
 *   SEED_DEMO=false – skip demo users and demo data
 */
import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Prisma } from '../src/generated/prisma/client.js'
import { DEFAULT_ROLES, OWNER_ROLE } from '../src/auth/permissions.js'
import { DEFAULT_CONTRACT_TEMPLATE } from '../src/documents/render.js'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

/** Demo accounts, one per role (password = DEMO_PASSWORD). */
export const DEMO_USERS = [
  { username: 'admin', fullName: 'Administrator', role: 'admin' },
  { username: 'director', fullName: 'Karimov Bobur', role: 'director' },
  { username: 'seller1', fullName: 'Tursunov Jasur', role: 'seller' },
  { username: 'engineer', fullName: 'Rahimov Aziz', role: 'engineer' },
  { username: 'declarant', fullName: 'Yusupova Dilfuza', role: 'declarant' },
  { username: 'supply', fullName: "Ergashev Sardor", role: 'procurement' },
  { username: 'accountant', fullName: 'Xasanova Munira', role: 'accountant' },
  { username: 'storekeeper', fullName: 'Qodirov Akmal', role: 'storekeeper' },
  { username: 'driver1', fullName: 'Sobirov Anvar', role: 'driver' },
]
export const DEMO_PASSWORD = 'Demo12345'

type Json = Record<string, unknown>

export async function seed(db: PrismaClient = prisma, opts: { demo?: boolean } = {}) {
  const demo = opts.demo ?? process.env.SEED_DEMO !== 'false'

  for (const r of DEFAULT_ROLES) {
    await db.role.upsert({
      where: { key: r.key },
      create: { key: r.key, name: r.name, description: r.description, permissions: r.permissions, isSystem: true },
      update: {}, // keep permissions the owner may have edited
    })
  }
  const roleId = async (key: string) => (await db.role.findUniqueOrThrow({ where: { key } })).id

  const ownerName = process.env.SEED_OWNER_USERNAME ?? 'owner'
  if (!(await db.user.findFirst({ where: { role: { key: OWNER_ROLE } } }))) {
    const pass = process.env.SEED_OWNER_PASSWORD
    if (!pass || pass.length < 8) throw new Error('SEED_OWNER_PASSWORD (min 8 chars) is required to create the first owner')
    await db.user.create({ data: { username: ownerName, fullName: 'Owner', passwordHash: await bcrypt.hash(pass, 10), roleId: await roleId(OWNER_ROLE) } })
  }

  if (!(await db.setting.findUnique({ where: { key: 'app' } }))) {
    await db.setting.create({ data: { key: 'app', value: {
      company: { name: 'Atoyo MChJ', inn: '', address: 'Toshkent', phone: '', bank: '', director: '' },
      advancePct: 30, defaultMarkupPct: 20, deadlineDays: 90, defaultVatPct: 12,
    } } })
  }
  if ((await db.contractTemplate.count()) === 0) {
    await db.contractTemplate.create({ data: { name: 'Standart shartnoma', body: DEFAULT_CONTRACT_TEMPLATE, isDefault: true } })
  }

  if (!demo) return
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10)
  for (const u of DEMO_USERS) {
    await db.user.upsert({ where: { username: u.username }, create: { username: u.username, fullName: u.fullName, passwordHash: hash, roleId: await roleId(u.role) }, update: {} })
  }

  if ((await db.product.count()) > 0) return
  const data = JSON.parse(readFileSync(new URL('../../prisma/seed-data.json', import.meta.url) /* from dist/prisma */, 'utf-8')) as Record<string, Json[]>
  const pick = (o: Json, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]))
  const d = (v: unknown) => new Date(String(v))

  await db.product.createMany({ data: data.products.map((p) => pick(p, ['id', 'code', 'name', 'unit', 'category', 'price', 'costPrice', 'barcode', 'description', 'isActive'])) as Prisma.ProductCreateManyInput[] })
  await db.customer.createMany({ data: data.customers.map((c) => pick(c, ['id', 'code', 'name', 'phone', 'email', 'address', 'inn', 'debt', 'totalPurchases', 'isActive'])) as Prisma.CustomerCreateManyInput[] })
  await db.supplier.createMany({ data: data.suppliers.map((s) => pick(s, ['id', 'code', 'name', 'phone', 'email', 'address', 'inn', 'balance', 'totalSupplied', 'isActive'])) as Prisma.SupplierCreateManyInput[] })
  await db.employee.createMany({ data: data.employees.map((e) => pick(e, ['id', 'code', 'fullName', 'position', 'department', 'salary', 'phone', 'email', 'hireDate', 'isActive'])) as Prisma.EmployeeCreateManyInput[] })
  await db.warehouse.createMany({ data: data.warehouses.map((w) => pick(w, ['id', 'code', 'name', 'address', 'manager', 'isActive'])) as Prisma.WarehouseCreateManyInput[] })
  await db.stockBalance.createMany({ data: data.stockBalance.map((b) => pick(b, ['id', 'warehouseId', 'productId', 'qty', 'reservedQty', 'costPrice'])) as Prisma.StockBalanceCreateManyInput[] })
  await db.saleOrder.createMany({ data: data.saleOrders.map((o) => ({ ...pick(o, ['id', 'number', 'customerId', 'warehouseId', 'warehouseName', 'items', 'status', 'total', 'paid', 'notes']), date: d(o.date) })) as Prisma.SaleOrderCreateManyInput[] })
  await db.purchaseOrder.createMany({ data: data.purchaseOrders.map((o) => ({ ...pick(o, ['id', 'number', 'supplierId', 'warehouseId', 'warehouseName', 'items', 'status', 'total', 'paid', 'notes']), date: d(o.date) })) as Prisma.PurchaseOrderCreateManyInput[] })
  await db.invoice.createMany({ data: data.invoices.map((i) => ({ ...pick(i, ['id', 'number', 'type', 'orderId', 'counterpartyId', 'counterpartyName', 'amount', 'status']), date: d(i.date), dueDate: d(i.dueDate) })) as Prisma.InvoiceCreateManyInput[] })
  await db.payment.createMany({ data: data.payments.map((p) => ({ ...pick(p, ['id', 'number', 'type', 'direction', 'amount', 'counterpartyId', 'counterpartyName', 'category', 'description']), date: d(p.date) })) as Prisma.PaymentCreateManyInput[] })
  await db.stockMovement.createMany({ data: data.movements.map((m) => ({ ...pick(m, ['id', 'number', 'type', 'fromWarehouseId', 'fromWarehouseName', 'toWarehouseId', 'toWarehouseName', 'items', 'status', 'notes']), date: d(m.date) })) as Prisma.StockMovementCreateManyInput[] })

  // Continue document numbering after the imported numbers.
  const all = [...data.saleOrders, ...data.purchaseOrders, ...data.invoices, ...data.payments, ...data.movements].map((x) => String(x.number))
  const max = new Map<string, number>()
  for (const n of all) {
    const m = /^([A-Z]+)-(\d+)$/.exec(n)
    if (m) max.set(m[1], Math.max(max.get(m[1]) ?? 0, Number(m[2])))
  }
  for (const [key, value] of max) await db.counter.upsert({ where: { key }, create: { key, value }, update: { value } })
}

if (process.argv[1]?.endsWith('seed.js')) {
  seed().then(() => console.log('Seed: done')).catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
}
