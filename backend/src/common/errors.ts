import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger, PayloadTooLargeException } from '@nestjs/common'
import type { Response } from 'express'
import { Prisma } from '../generated/prisma/client.js'

/** Business rule violation shown to the user as-is (HTTP 400). */
export class BusinessError extends HttpException {
  constructor(message: string, status = HttpStatus.BAD_REQUEST) {
    super({ statusCode: status, message }, status)
  }
}

/** Maps Prisma errors to proper HTTP statuses with readable messages. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error')

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    if (exception instanceof PayloadTooLargeException) {
      // Multer's size limit ("File too large"): readable message with the configured limit.
      const mb = Number(process.env.UPLOAD_MAX_MB) > 0 ? Number(process.env.UPLOAD_MAX_MB) : 10
      res.status(413).json({ statusCode: 413, message: `Fayl hajmi juda katta (maksimal ${mb} MB)` })
      return
    }
    if (exception instanceof HttpException) {
      const body = exception.getResponse()
      res.status(exception.getStatus()).json(typeof body === 'string' ? { statusCode: exception.getStatus(), message: body } : body)
      return
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const map: Record<string, [number, string]> = {
        P2002: [409, 'Bunday qiymat allaqachon mavjud (takrorlanmas maydon)'],
        P2003: [409, "Bog'langan yozuvlar bor, o'chirib bo'lmaydi"],
        P2025: [404, 'Yozuv topilmadi'],
      }
      const [status, message] = map[exception.code] ?? [400, "So'rov bajarilmadi"]
      res.status(status).json({ statusCode: status, message, code: exception.code })
      return
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception))
    res.status(500).json({ statusCode: 500, message: 'Serverda xatolik yuz berdi' })
  }
}
