import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { z } from 'zod'
import { PrismaService } from '../common/prisma.service.js'
import { AuditService } from '../common/audit.service.js'
import { ZodPipe, str } from '../common/zod.js'
import { CurrentUser, Perm } from '../auth/decorators.js'
import type { AuthUser } from '../auth/auth.types.js'
import { BusinessError } from '../common/errors.js'
import { CONTRACT_PLACEHOLDERS, DEFAULT_CONTRACT_TEMPLATE, unknownPlaceholders } from './render.js'

const TemplateDto = z.object({ name: str, body: str, isDefault: z.boolean().default(false) })

function checkBody(body?: string) {
  if (body === undefined) return
  const bad = unknownPlaceholders(body)
  if (bad.length) throw new BusinessError(`Shablonda noma'lum maydon(lar): ${bad.map((k) => `{{${k}}}`).join(', ')}`)
  if (!/\{\{\s*itemsTable\s*\}\}/.test(body)) throw new BusinessError("Shablonda {{itemsTable}} (tovarlar jadvali) bo'lishi shart")
}

@ApiTags('documents')
@Controller()
export class DocumentsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get('contract-templates') @Perm('templates.manage', 'requests.contract')
  templates() {
    return this.prisma.contractTemplate.findMany({ orderBy: { createdAt: 'asc' } })
  }

  @Get('contract-templates/placeholders') @Perm('templates.manage', 'requests.contract')
  placeholders() {
    return {
      placeholders: CONTRACT_PLACEHOLDERS,
      example: DEFAULT_CONTRACT_TEMPLATE,
    }
  }

  @Post('contract-templates') @Perm('templates.manage')
  async createTemplate(@CurrentUser() u: AuthUser, @Body(new ZodPipe(TemplateDto)) b: z.infer<typeof TemplateDto>) {
    checkBody(b.body)
    const t = await this.prisma.$transaction(async (tx) => {
      if (b.isDefault) await tx.contractTemplate.updateMany({ data: { isDefault: false } })
      return tx.contractTemplate.create({ data: b })
    })
    await this.audit.log(u, 'create', 'contractTemplate', t.id)
    return t
  }

  @Patch('contract-templates/:id') @Perm('templates.manage')
  async updateTemplate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(TemplateDto.partial())) b: Partial<z.infer<typeof TemplateDto>>) {
    checkBody(b.body)
    const t = await this.prisma.$transaction(async (tx) => {
      if (b.isDefault) await tx.contractTemplate.updateMany({ where: { id: { not: id } }, data: { isDefault: false } })
      return tx.contractTemplate.update({ where: { id }, data: b })
    })
    await this.audit.log(u, 'update', 'contractTemplate', id)
    return t
  }

  @Delete('contract-templates/:id') @Perm('templates.manage') @HttpCode(204)
  async deleteTemplate(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.prisma.contractTemplate.delete({ where: { id } })
    await this.audit.log(u, 'delete', 'contractTemplate', id)
  }

  @Get('contracts') @Perm('requests.contract', 'requests.advance', 'payments.view')
  contracts() {
    return this.prisma.contract.findMany({
      orderBy: { createdAt: 'desc' },
      include: { request: { select: { id: true, number: true, status: true, paid: true, customer: { select: { name: true } } } } },
    })
  }

  @Get('acts') @Perm('requests.act', 'requests.contract', 'payments.view')
  acts() {
    return this.prisma.act.findMany({
      orderBy: { createdAt: 'desc' },
      include: { request: { select: { id: true, number: true, customer: { select: { name: true } } } } },
    })
  }
}
