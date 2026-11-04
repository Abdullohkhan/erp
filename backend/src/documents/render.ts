const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export const fmtMoney = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n)) + " so'm"
export const fmtDate = (d: Date) => d.toLocaleDateString('ru-RU')

/** Placeholders a contract template may use (anything else is rejected when the template is saved). */
export const CONTRACT_PLACEHOLDERS = ['number', 'date', 'total', 'advancePct', 'advanceAmount', 'deadlineDays', 'itemsTable',
  'customer.name', 'customer.inn', 'customer.address', 'customer.phone',
  'company.name', 'company.inn', 'company.address', 'company.phone', 'company.bank', 'company.director']

/** Placeholders used in `body` that are not in `allowed` (typos would silently print nothing). */
export function unknownPlaceholders(body: string, allowed: string[] = CONTRACT_PLACEHOLDERS): string[] {
  const used = [...body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1])
  return [...new Set(used.filter((k) => !allowed.includes(k)))]
}

export interface DocLine { name: string; qty: number; unit: string; price: number }

export function itemsTable(lines: DocLine[]): string {
  const rows = lines.map((l, i) =>
    `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td>${esc(l.qty)} ${esc(l.unit)}</td><td>${esc(fmtMoney(l.price))}</td><td>${esc(fmtMoney(l.qty * l.price))}</td></tr>`).join('')
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0)
  return `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%">
<thead><tr><th>№</th><th>Nomi</th><th>Miqdori</th><th>Narxi</th><th>Summa</th></tr></thead>
<tbody>${rows}<tr><td colspan="4" style="text-align:right"><b>Jami</b></td><td><b>${esc(fmtMoney(total))}</b></td></tr></tbody></table>`
}

/**
 * Replaces {{path.to.value}} placeholders. Values are HTML-escaped, except keys listed in `raw`
 * (generated HTML such as the items table).
 */
export function renderTemplate(body: string, data: Record<string, unknown>, raw: string[] = ['itemsTable']): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), data)
    return raw.includes(key) ? String(v ?? '') : esc(v)
  })
}

export const DEFAULT_CONTRACT_TEMPLATE = `<h2 style="text-align:center">SHARTNOMA № {{number}}</h2>
<p style="text-align:right">{{date}}</p>
<p><b>{{company.name}}</b> (keyingi o'rinlarda "Bajaruvchi"), INN {{company.inn}}, bir tomondan, va
<b>{{customer.name}}</b> (keyingi o'rinlarda "Buyurtmachi"), INN {{customer.inn}}, ikkinchi tomondan, quyidagilar haqida shartnoma tuzdilar:</p>
<h4>1. Shartnoma predmeti</h4>
<p>Bajaruvchi quyidagi tovar va xizmatlarni yetkazib beradi:</p>
{{itemsTable}}
<h4>2. Narx va to'lov tartibi</h4>
<p>Shartnomaning umumiy qiymati: <b>{{total}}</b>. Buyurtmachi {{advancePct}}% miqdorida oldindan to'lov (<b>{{advanceAmount}}</b>) amalga oshiradi.
Oldindan to'lov kelib tushgunga qadar ishlar boshlanmaydi. Qolgan summa tovar topshirilgandan keyin to'lanadi.</p>
<h4>3. Muddat</h4>
<p>Bajarish muddati: oldindan to'lov kelib tushgan kundan boshlab {{deadlineDays}} kun.</p>
<h4>4. Tomonlarning rekvizitlari</h4>
<table style="width:100%"><tr>
<td style="vertical-align:top;width:50%"><b>Bajaruvchi:</b><br>{{company.name}}<br>{{company.address}}<br>INN: {{company.inn}}<br>{{company.bank}}<br>Tel: {{company.phone}}<br><br>Direktor: ____________ {{company.director}}</td>
<td style="vertical-align:top"><b>Buyurtmachi:</b><br>{{customer.name}}<br>{{customer.address}}<br>INN: {{customer.inn}}<br>Tel: {{customer.phone}}<br><br>____________</td>
</tr></table>`

export const DEFAULT_ACT_TEMPLATE = `<h2 style="text-align:center">QABUL QILISH-TOPSHIRISH DALOLATNOMASI № {{number}}</h2>
<p style="text-align:right">{{date}}</p>
<p>{{contractNumber}}-sonli shartnoma asosida <b>{{company.name}}</b> quyidagi tovarlarni <b>{{customer.name}}</b>ga topshirdi, Buyurtmachi esa qabul qildi:</p>
{{itemsTable}}
<p>Jami: <b>{{total}}</b>. To'langan: <b>{{paid}}</b>. Qoldiq: <b>{{balance}}</b>.</p>
<p>Tomonlarning bir-biriga e'tirozlari yo'q.</p>
<table style="width:100%"><tr><td>Topshirdi: ____________ {{company.name}}</td><td>Qabul qildi: ____________ {{customer.name}}</td></tr></table>`
