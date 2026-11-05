import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBody, ApiConsumes } from '@nestjs/swagger'
import type { Response } from 'express'
import { ApiTags } from '@nestjs/swagger'
import { z } from 'zod'
import { PrismaService } from '../common/prisma.service.js'
import { AuditService } from '../common/audit.service.js'
import { ZodPipe, str } from '../common/zod.js'
import { CurrentUser, Perm } from '../auth/decorators.js'
import type { AuthUser } from '../auth/auth.types.js'
import { BusinessError } from '../common/errors.js'
import { RequestsService } from '../requests/requests.service.js'
import { CONTRACT_PLACEHOLDERS, DEFAULT_CONTRACT_TEMPLATE, unknownPlaceholders } from './render.js'
import { contentDisposition, htmlToPdf } from './pdf.js'
import { maxUploadBytes, sendScan, type UploadedScan } from './scans.js'

/** Multipart field "file", one file; the size limit stops reading early (413). */
const ScanUpload = () => UseInterceptors(FileInterceptor('file', { limits: { fileSize: maxUploadBytes(), files: 1, fields: 5 } }))
const ScanBody = { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } as const

/** Sends a generated PDF (bypasses the JSON serializer). */
export async function sendPdf(res: Response, fileName: string, html: string, title: string) {
  const pdf = await htmlToPdf(html, { title })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', contentDisposition(fileName))
  res.setHeader('Cache-Control', 'no-store')
  res.end(pdf)
}

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
  constructor(private prisma: PrismaService, private audit: AuditService, private requests: RequestsService) {}

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

  // ───────────── PDF (server-side) ─────────────

  @Get('contracts/:id/pdf') @Perm('requests.contract', 'requests.advance', 'payments.view')
  async contractPdf(@Param('id') id: string, @Res() res: Response) {
    const c = await this.prisma.contract.findUniqueOrThrow({ where: { id } })
    await sendPdf(res, `Shartnoma-${c.number}.pdf`, c.body, `Shartnoma ${c.number}`)
  }

  @Get('acts/:id/pdf') @Perm('requests.act', 'requests.contract', 'payments.view')
  async actPdf(@Param('id') id: string, @Res() res: Response) {
    const a = await this.prisma.act.findUniqueOrThrow({ where: { id } })
    await sendPdf(res, `Dalolatnoma-${a.number}.pdf`, a.body, `Dalolatnoma ${a.number}`)
  }

  /** Payment invoice (hisob): HTML preview. */
  @Get('requests/:id/invoice') @Perm('requests.contract', 'requests.advance', 'payments.view')
  invoice(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.requests.invoice(u, id)
  }

  @Get('requests/:id/invoice/pdf') @Perm('requests.contract', 'requests.advance', 'payments.view')
  async invoicePdf(@CurrentUser() u: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const inv = await this.requests.invoice(u, id)
    await sendPdf(res, `Hisob-${inv.number}.pdf`, inv.html, `Hisob ${inv.number}`)
  }

  // ───────────── Signed scans ─────────────

  @Post('contracts/:id/scan') @Perm('requests.contract') @ScanUpload() @ApiConsumes('multipart/form-data') @ApiBody(ScanBody)
  uploadContractScan(@CurrentUser() u: AuthUser, @Param('id') id: string, @UploadedFile() file?: UploadedScan) {
    return this.requests.attachScan(u, 'contract', id, file)
  }

  @Post('acts/:id/scan') @Perm('requests.act') @ScanUpload() @ApiConsumes('multipart/form-data') @ApiBody(ScanBody)
  uploadActScan(@CurrentUser() u: AuthUser, @Param('id') id: string, @UploadedFile() file?: UploadedScan) {
    return this.requests.attachScan(u, 'act', id, file)
  }

  @Get('contracts/:id/scan') @Perm('requests.contract', 'requests.advance', 'payments.view')
  async contractScan(@Param('id') id: string, @Res() res: Response) {
    await sendScan(res, await this.prisma.contract.findUniqueOrThrow({ where: { id } }))
  }

  @Get('acts/:id/scan') @Perm('requests.act', 'requests.contract', 'payments.view')
  async actScan(@Param('id') id: string, @Res() res: Response) {
    await sendScan(res, await this.prisma.act.findUniqueOrThrow({ where: { id } }))
  }
}
