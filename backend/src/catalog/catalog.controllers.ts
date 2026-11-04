import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Type } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { z, type ZodObject, type ZodRawShape } from 'zod'
import { PrismaService } from '../common/prisma.service.js'
import { AuditService } from '../common/audit.service.js'
import { ZodPipe, money, optStr, str } from '../common/zod.js'
import { CurrentUser, Perm, canSeePrices, has } from '../auth/decorators.js'
import type { Permission } from '../auth/permissions.js'
import type { AuthUser } from '../auth/auth.types.js'

type Model = 'product' | 'customer' | 'supplier' | 'employee' | 'warehouse'

interface CatalogDef {
  path: string
  model: Model
  view: Permission
  manage: Permission
  schema: ZodObject<ZodRawShape>
  /** Fields hidden from users without `costs.view`. */
  costFields?: string[]
  /** Fields hidden from users who may not see sale prices (the engineer). */
  priceFields?: string[]
  orderBy?: Record<string, 'asc' | 'desc'>
}

const phone = z.string().trim().regex(/^\+?[0-9\s()-]{9,18}$/, "Telefon raqami noto'g'ri")
const email = z.string().trim().email("Email noto'g'ri").optional().nullable().or(z.literal(''))

export const CATALOGS: CatalogDef[] = [
  {
    path: 'products', model: 'product', view: 'products.view', manage: 'products.manage', costFields: ['costPrice'], priceFields: ['price'],
    schema: z.object({
      code: str, name: str, unit: z.string().default('dona'), category: z.string().default('other'),
      price: money.default(0), costPrice: money.default(0), barcode: optStr, description: optStr, tnvedCode: optStr,
      isActive: z.boolean().default(true),
    }),
  },
  {
    path: 'customers', model: 'customer', view: 'customers.view', manage: 'customers.manage',
    schema: z.object({
      code: str, name: str, type: z.enum(['individual', 'legal']).default('individual'), phone, email,
      address: optStr, inn: optStr, isActive: z.boolean().default(true),
    }),
  },
  {
    path: 'suppliers', model: 'supplier', view: 'suppliers.view', manage: 'suppliers.manage',
    schema: z.object({ code: str, name: str, phone, email, address: optStr, inn: optStr, isActive: z.boolean().default(true) }),
  },
  {
    path: 'employees', model: 'employee', view: 'employees.view', manage: 'employees.manage',
    schema: z.object({
      code: str, fullName: str, position: str, department: str, salary: money.default(0), phone, email,
      hireDate: str, isActive: z.boolean().default(true),
    }),
  },
  {
    path: 'warehouses', model: 'warehouse', view: 'warehouses.view', manage: 'warehouses.manage',
    schema: z.object({ code: str, name: str, address: optStr, manager: optStr, isActive: z.boolean().default(true) }),
  },
]

type Delegate = {
  findMany(args: object): Promise<Record<string, unknown>[]>
  findUniqueOrThrow(args: object): Promise<Record<string, unknown>>
  create(args: object): Promise<Record<string, unknown>>
  update(args: object): Promise<Record<string, unknown>>
  delete(args: object): Promise<unknown>
}

export const stripFields = <T extends Record<string, unknown>>(row: T, fields: string[] = []): T => {
  if (!fields.length) return row
  const copy = { ...row }
  for (const f of fields) delete copy[f]
  return copy
}

function makeController(def: CatalogDef): Type<unknown> {
  const createDto = def.schema
  const updateDto = def.schema.partial()

  @ApiTags('catalogs')
  @Controller(def.path)
  class CatalogController {
    constructor(private prisma: PrismaService, private audit: AuditService) {}

    private get repo(): Delegate {
      return this.prisma[def.model] as unknown as Delegate
    }

    private view(user: AuthUser, row: Record<string, unknown>) {
      if (has(user, 'costs.view')) return row
      const out = stripFields(row, def.costFields)
      return canSeePrices(user) ? out : stripFields(out, def.priceFields)
    }

    @Get() @Perm(def.view, def.manage)
    async list(@CurrentUser() user: AuthUser) {
      const rows = await this.repo.findMany({ orderBy: def.orderBy ?? { code: 'asc' } })
      return rows.map((r) => this.view(user, r))
    }

    @Get(':id') @Perm(def.view, def.manage)
    async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
      return this.view(user, await this.repo.findUniqueOrThrow({ where: { id } }))
    }

    @Post() @Perm(def.manage)
    async create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createDto)) body: Record<string, unknown>) {
      const row = await this.repo.create({ data: body })
      await this.audit.log(user, 'create', def.model, row.id as string, body)
      return this.view(user, row)
    }

    @Patch(':id') @Perm(def.manage)
    async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(updateDto)) body: Record<string, unknown>) {
      const row = await this.repo.update({ where: { id }, data: body })
      await this.audit.log(user, 'update', def.model, id, body)
      return this.view(user, row)
    }

    @Delete(':id') @Perm(def.manage) @HttpCode(204)
    async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
      await this.repo.delete({ where: { id } })
      await this.audit.log(user, 'delete', def.model, id)
    }
  }
  Object.defineProperty(CatalogController, 'name', { value: `${def.model[0].toUpperCase()}${def.model.slice(1)}Controller` })
  return CatalogController
}

export const catalogControllers = CATALOGS.map(makeController)
