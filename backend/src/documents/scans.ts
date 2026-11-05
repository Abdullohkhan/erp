/**
 * Signed document scans on disk. Directory: UPLOAD_DIR (default ./uploads), size limit: UPLOAD_MAX_MB (default 10).
 * The type is detected from the file's first bytes (not the client's Content-Type or name), and files are stored
 * under generated names, so a client cannot choose the path on disk.
 */
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import type { Response } from 'express'
import { BusinessError } from '../common/errors.js'
import { contentDisposition } from './pdf.js'

export interface UploadedScan { buffer: Buffer; originalname: string; mimetype: string; size: number }

export const SCAN_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' } as const
export type ScanMime = keyof typeof SCAN_TYPES

export const uploadDir = () => resolve(process.env.UPLOAD_DIR || 'uploads')
export const maxUploadMb = () => {
  const n = Number(process.env.UPLOAD_MAX_MB)
  return Number.isFinite(n) && n > 0 ? n : 10
}
export const maxUploadBytes = () => Math.round(maxUploadMb() * 1024 * 1024)

/** File type by magic bytes: %PDF, JPEG SOI marker, PNG signature. */
export function detectScanType(b: Buffer): ScanMime | null {
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  return null
}

/** Validates an upload and returns its detected type. */
export function checkScan(file: UploadedScan | undefined): ScanMime {
  if (!file || !file.buffer?.length) throw new BusinessError('Fayl tanlanmagan')
  if (file.size > maxUploadBytes()) throw new BusinessError(`Fayl hajmi juda katta (maksimal ${maxUploadMb()} MB)`, 413)
  const type = detectScanType(file.buffer)
  if (!type) throw new BusinessError('Faqat PDF, JPG yoki PNG fayl yuklash mumkin', 415)
  return type
}

/** Path inside the upload directory; refuses anything that would escape it. */
function inside(rel: string) {
  const root = uploadDir()
  const full = resolve(root, rel)
  if (full !== root && !full.startsWith(root + sep)) throw new BusinessError("Fayl yo'li noto'g'ri")
  return full
}

/** Writes the file under `<UPLOAD_DIR>/<folder>/<uuid>.<ext>` and returns the relative path stored in the database. */
export async function saveScan(folder: 'contracts' | 'acts', file: UploadedScan, type: ScanMime) {
  const dir = join(uploadDir(), folder)
  await mkdir(dir, { recursive: true })
  const full = join(dir, `${randomUUID()}.${SCAN_TYPES[type]}`)
  await writeFile(full, file.buffer, { flag: 'wx', mode: 0o640 })
  return relative(uploadDir(), full).split(sep).join('/')
}

export async function removeScan(rel: string | null | undefined) {
  if (rel) await rm(inside(rel), { force: true })
}

/** Original name made safe for a download (no path, no control characters). */
export const cleanName = (name: string, type: ScanMime) => {
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[\p{Cc}"]/gu, '').trim().slice(0, 150) || 'skan'
  return /\.[a-z0-9]{2,4}$/i.test(base) ? base : `${base}.${SCAN_TYPES[type]}`
}

export async function sendScan(res: Response, doc: { scanFile: string | null; scanName: string | null; scanMime: string | null }) {
  if (!doc.scanFile) throw new BusinessError('Imzolangan skan yuklanmagan', 404)
  const full = inside(doc.scanFile)
  const info = await stat(full).catch(() => null)
  if (!info) throw new BusinessError('Skan fayli topilmadi', 404)
  res.setHeader('Content-Type', doc.scanMime ?? 'application/octet-stream')
  res.setHeader('Content-Length', String(info.size))
  res.setHeader('Content-Disposition', contentDisposition(doc.scanName ?? 'skan'))
  res.setHeader('Cache-Control', 'private, no-store')
  await new Promise<void>((ok, fail) => createReadStream(full).on('error', fail).on('end', ok).pipe(res))
}
