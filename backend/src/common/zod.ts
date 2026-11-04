import { BadRequestException, PipeTransform } from '@nestjs/common'
import { z, type ZodType } from 'zod'

/** Validates and parses a request body / query with a zod schema. */
export class ZodPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const r = this.schema.safeParse(value)
    if (!r.success) {
      const issues = r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      throw new BadRequestException({ statusCode: 400, message: issues.join('; '), issues: r.error.issues })
    }
    return r.data
  }
}

export const str = z.string().trim().min(1)
export const optStr = z.string().trim().optional().nullable()
/** Money in whole so'm (fractions are rounded). */
export const money = z.coerce.number().min(0).transform((n) => Math.round(n))
export const qty = z.coerce.number().positive()
export const date = z.coerce.date()
