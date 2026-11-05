/**
 * Server-side PDF (pdfmake → pdfkit, no browser). Documents are stored as simple HTML
 * (contract / act templates), so a small HTML → pdfmake converter handles the tags templates use:
 * h1–h6, p, div, br, b/strong, i/em, u, span, ul/ol/li, table/thead/tbody/tr/td/th (colspan),
 * and the `text-align` style. Unknown tags are rendered as their text.
 * Fonts: Roboto TTF shipped with pdfmake (Latin + Cyrillic).
 */
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import pdfmake from 'pdfmake'
import type { Content, TableCell } from 'pdfmake/interfaces.js'

const require = createRequire(import.meta.url)
const fontFile = require.resolve('pdfmake/fonts/Roboto/Roboto-Regular.ttf')
const fontDir = dirname(fontFile)

pdfmake.setFonts({
  Roboto: {
    normal: `${fontDir}/Roboto-Regular.ttf`,
    bold: `${fontDir}/Roboto-Medium.ttf`,
    italics: `${fontDir}/Roboto-Italic.ttf`,
    bolditalics: `${fontDir}/Roboto-MediumItalic.ttf`,
  },
})
// Documents never load remote resources; local access only for the fonts.
pdfmake.setUrlAccessPolicy(() => false)
pdfmake.setLocalAccessPolicy((p) => p.startsWith(fontDir))

// ───────────── Minimal HTML parser ─────────────

interface El { tag: string; attrs: Record<string, string>; children: Node[] }
type Node = El | string

const VOID = new Set(['br', 'hr', 'img', 'meta', 'link', 'input', 'col'])
const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'ul', 'ol', 'li', 'hr', 'section', 'article', 'header', 'footer', 'blockquote'])

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…', copy: '©', numero: '№' }
export const decodeEntities = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') {
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
  }
  return ENTITIES[e.toLowerCase()] ?? m
})

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of s.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return out
}

export function parseHtml(html: string): El {
  const root: El = { tag: 'root', attrs: {}, children: [] }
  const stack: El[] = [root]
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  for (const m of clean.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>|([^<]+)|</g)) {
    const top = stack[stack.length - 1]
    if (m[5] !== undefined || m[2] === undefined) {
      top.children.push(decodeEntities(m[5] ?? '<'))
      continue
    }
    const tag = m[2].toLowerCase()
    if (m[1]) {
      // Closing tag: pop up to the matching element (tolerates unclosed children).
      const idx = stack.map((e) => e.tag).lastIndexOf(tag)
      if (idx > 0) stack.length = idx
      continue
    }
    const el: El = { tag, attrs: parseAttrs(m[3]), children: [] }
    // A new <p>/<li>/<tr>/<td> implicitly closes an open sibling of the same kind.
    if (['p', 'li', 'tr', 'td', 'th'].includes(tag) && top.tag === tag) stack.pop()
    stack[stack.length - 1].children.push(el)
    if (!VOID.has(tag) && !m[4]) stack.push(el)
  }
  return root
}

// ───────────── HTML → pdfmake ─────────────

interface Inline { bold?: boolean; italics?: boolean; decoration?: 'underline' }
type Run = { text: string } & Inline

const HEADINGS: Record<string, { fontSize: number; margin: [number, number, number, number] }> = {
  h1: { fontSize: 18, margin: [0, 6, 0, 8] }, h2: { fontSize: 15, margin: [0, 6, 0, 8] }, h3: { fontSize: 13, margin: [0, 6, 0, 6] },
  h4: { fontSize: 12, margin: [0, 8, 0, 4] }, h5: { fontSize: 11, margin: [0, 6, 0, 4] }, h6: { fontSize: 10, margin: [0, 6, 0, 4] },
}

function alignment(el: El): 'left' | 'center' | 'right' | 'justify' | undefined {
  const a = (/text-align\s*:\s*(left|center|right|justify)/i.exec(el.attrs.style ?? '')?.[1] ?? el.attrs.align)?.toLowerCase()
  return a === 'left' || a === 'center' || a === 'right' || a === 'justify' ? a : undefined
}

function inlineStyle(el: El, base: Inline): Inline {
  const s = { ...base }
  if (['b', 'strong', 'th'].includes(el.tag) || /font-weight\s*:\s*(bold|[6-9]00)/i.test(el.attrs.style ?? '')) s.bold = true
  if (['i', 'em'].includes(el.tag) || /font-style\s*:\s*italic/i.test(el.attrs.style ?? '')) s.italics = true
  if (el.tag === 'u') s.decoration = 'underline'
  return s
}

/** Roboto has no U+02BB (Uzbek oʻ / gʻ): use the visually identical left quote instead of a blank box. */
const glyphs = (s: string) => s.replace(/\u02bb/g, '\u2018')

const isBlock = (n: Node): n is El => typeof n !== 'string' && BLOCK.has(n.tag)

/** Collects inline runs (text with bold/italic) from a node; <br> becomes a line break. */
function runs(n: Node, style: Inline, out: Run[]) {
  if (typeof n === 'string') {
    const text = glyphs(n.replace(/\s+/g, ' '))
    if (text) out.push({ text, ...style })
    return
  }
  if (n.tag === 'br') { out.push({ text: '\n' }); return }
  const s = inlineStyle(n, style)
  for (const c of n.children) runs(c, s, out)
}

/** Trims spaces at paragraph edges and around line breaks; returns null for an empty paragraph. */
function paragraph(items: Run[], extra: Record<string, unknown> = {}): Content | null {
  const parts = items.map((r) => ({ ...r }))
  for (let i = 0; i < parts.length; i++) {
    if (i === 0 || parts[i - 1].text.endsWith('\n')) parts[i].text = parts[i].text.replace(/^ +/, '')
    if (i === parts.length - 1 || parts[i + 1].text.startsWith('\n')) parts[i].text = parts[i].text.replace(/ +$/, '')
  }
  const kept = parts.filter((r) => r.text !== '')
  if (!kept.some((r) => r.text.trim())) return null
  return { text: kept, ...extra } as Content
}

function blocks(el: El, style: Inline = {}): Content[] {
  const out: Content[] = []
  let pending: Run[] = []
  const align = alignment(el)
  const flush = () => {
    const p = paragraph(pending, align ? { alignment: align } : {})
    if (p) out.push(p)
    pending = []
  }
  for (const c of el.children) {
    if (!isBlock(c)) { runs(c, style, pending); continue }
    flush()
    out.push(...block(c, style))
  }
  flush()
  return out
}

function block(el: El, style: Inline): Content[] {
  const s = inlineStyle(el, style)
  const align = alignment(el)
  if (el.tag in HEADINGS) {
    const r: Run[] = []
    runs(el, { ...s, bold: true }, r)
    const p = paragraph(r, { ...HEADINGS[el.tag], ...(align ? { alignment: align } : {}) })
    return p ? [p] : []
  }
  if (el.tag === 'hr') return [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 4] }]
  if (el.tag === 'table') return [table(el, s)]
  if (el.tag === 'ul' || el.tag === 'ol') {
    const items = el.children.filter((c): c is El => typeof c !== 'string' && c.tag === 'li').map((li) => ({ stack: blocks(li, s) }))
    return [{ [el.tag]: items, margin: [0, 0, 0, 6] } as unknown as Content]
  }
  const inner = blocks(el, s)
  if (!inner.length) return []
  return [{ stack: inner, margin: el.tag === 'p' ? [0, 0, 0, 6] : [0, 0, 0, 0], ...(align ? { alignment: align } : {}) } as Content]
}

function table(el: El, style: Inline): Content {
  const rows: { cells: El[]; head: boolean }[] = []
  const walk = (n: El, head: boolean) => {
    for (const c of n.children) {
      if (typeof c === 'string') continue
      if (c.tag === 'tr') rows.push({ cells: c.children.filter((x): x is El => typeof x !== 'string' && (x.tag === 'td' || x.tag === 'th')), head })
      else if (['thead', 'tbody', 'tfoot'].includes(c.tag)) walk(c, c.tag === 'thead')
    }
  }
  walk(el, false)
  const width = Math.max(1, ...rows.map((r) => r.cells.reduce((s, c) => s + Math.max(1, Number(c.attrs.colspan) || 1), 0)))
  const body: TableCell[][] = rows.map((r) => {
    const out: TableCell[] = []
    for (const c of r.cells) {
      const span = Math.min(width - out.length, Math.max(1, Number(c.attrs.colspan) || 1))
      const content = blocks(c, inlineStyle(c, style))
      const align = alignment(c)
      out.push({
        stack: content.length ? content : [{ text: '' }], ...(span > 1 ? { colSpan: span } : {}),
        ...(c.tag === 'th' ? { bold: true, fillColor: '#f2f2f2' } : {}), ...(align ? { alignment: align } : {}),
      } as TableCell)
      for (let i = 1; i < span; i++) out.push({ text: '' })
      if (out.length >= width) break
    }
    while (out.length < width) out.push({ text: '' })
    return out
  })
  if (!body.length) return { text: '' }
  const bordered = Number(el.attrs.border ?? 0) > 0
  // Wide text column: the second one in item tables (№, name, …), otherwise share the width.
  const widths = width >= 3 ? Array.from({ length: width }, (_, i) => (i === 1 ? '*' : 'auto')) : Array(width).fill('*')
  const headerRows = rows.findIndex((r) => !r.head)
  return {
    table: { widths, body, headerRows: headerRows > 0 ? headerRows : 0, dontBreakRows: true },
    layout: bordered ? undefined : 'noBorders',
    margin: [0, 2, 0, 8],
  } as Content
}

export const htmlToPdfContent = (html: string): Content[] => blocks(parseHtml(html))

/** Renders an HTML document body as an A4 PDF. */
export function htmlToPdf(html: string, meta: { title: string }): Promise<Buffer> {
  const doc = pdfmake.createPdf({
    info: { title: meta.title, creator: 'Atoyo ERP', producer: 'Atoyo ERP' },
    pageSize: 'A4',
    pageMargins: [56, 42, 34, 42],
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.2 },
    content: htmlToPdfContent(html),
    footer: (page, pages) => ({ text: `${page} / ${pages}`, alignment: 'right', fontSize: 8, margin: [0, 10, 34, 0], color: '#666' }),
  })
  return doc.getBuffer() as Promise<Buffer>
}

/** Safe ASCII file name for Content-Disposition plus the UTF-8 variant. */
export function contentDisposition(name: string, inline = false): string {
  const ascii = name.replace(/[^\w.-]+/g, '_')
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}
