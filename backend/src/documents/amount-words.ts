/**
 * Amount in words for documents (whole so'm): Uzbek (Latin) and Russian.
 *   amountInWordsUz(1250000) → "Bir million ikki yuz ellik ming so'm"
 *   amountInWordsRu(1250000) → "Один миллион двести пятьдесят тысяч сумов"
 * Fractions are rounded to whole so'm; negative amounts get "minus" / "минус".
 */

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Splits a non-negative integer into groups of three digits, lowest first. */
function triads(n: number): number[] {
  const out: number[] = []
  do {
    out.push(n % 1000)
    n = Math.floor(n / 1000)
  } while (n > 0)
  return out
}

function normalize(amount: number): { negative: boolean; n: number } {
  if (!Number.isFinite(amount)) throw new RangeError('Summa son bo\'lishi kerak')
  const n = Math.round(Math.abs(amount))
  if (n >= 1e15) throw new RangeError('Summa juda katta')
  return { negative: amount < 0 && n > 0, n }
}

// ───────────── Uzbek (Latin) ─────────────

const UZ_ONES = ['', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"]
const UZ_TENS = ['', "o'n", 'yigirma', "o'ttiz", 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', "to'qson"]
const UZ_SCALES = ['', 'ming', 'million', 'milliard', 'trillion']

function uzTriad(n: number): string[] {
  const h = Math.floor(n / 100)
  const t = Math.floor((n % 100) / 10)
  const o = n % 10
  return [h ? `${UZ_ONES[h]} yuz` : '', UZ_TENS[t], UZ_ONES[o]].filter(Boolean)
}

/** Number in Uzbek words without the currency, e.g. 2024 → "ikki ming yigirma to'rt". */
export function numberToWordsUz(value: number): string {
  const { negative, n } = normalize(value)
  if (n === 0) return 'nol'
  const parts: string[] = []
  triads(n).forEach((tr, i) => {
    if (tr === 0) return
    parts.unshift([...uzTriad(tr), UZ_SCALES[i]].filter(Boolean).join(' '))
  })
  return (negative ? 'minus ' : '') + parts.join(' ')
}

export const amountInWordsUz = (value: number) => capitalize(`${numberToWordsUz(value)} so'm`)

// ───────────── Russian ─────────────

const RU_ONES_M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
const RU_ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
const RU_TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
const RU_TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
const RU_HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']
/** [one, few, many] forms and grammatical gender of each scale word. */
const RU_SCALES: { forms: [string, string, string]; fem: boolean }[] = [
  { forms: ['', '', ''], fem: false },
  { forms: ['тысяча', 'тысячи', 'тысяч'], fem: true },
  { forms: ['миллион', 'миллиона', 'миллионов'], fem: false },
  { forms: ['миллиард', 'миллиарда', 'миллиардов'], fem: false },
  { forms: ['триллион', 'триллиона', 'триллионов'], fem: false },
]
const RU_SUM: [string, string, string] = ['сум', 'сума', 'сумов']

/** Russian plural form for a count: 1 сум, 2 сума, 5 сумов, 11 сумов, 21 сум. */
export function ruPlural(n: number, forms: [string, string, string]): string {
  const m100 = n % 100
  const m10 = n % 10
  if (m100 >= 11 && m100 <= 14) return forms[2]
  if (m10 === 1) return forms[0]
  if (m10 >= 2 && m10 <= 4) return forms[1]
  return forms[2]
}

function ruTriad(n: number, fem: boolean): string[] {
  const h = Math.floor(n / 100)
  const rest = n % 100
  const out = [RU_HUNDREDS[h]]
  if (rest >= 10 && rest < 20) out.push(RU_TEENS[rest - 10])
  else out.push(RU_TENS[Math.floor(rest / 10)], (fem ? RU_ONES_F : RU_ONES_M)[rest % 10])
  return out.filter(Boolean)
}

/** Number in Russian words (masculine), e.g. 2024 → "две тысячи двадцать четыре". */
export function numberToWordsRu(value: number): string {
  const { negative, n } = normalize(value)
  if (n === 0) return 'ноль'
  const parts: string[] = []
  triads(n).forEach((tr, i) => {
    if (tr === 0) return
    const s = RU_SCALES[i]
    parts.unshift([...ruTriad(tr, s.fem), i ? ruPlural(tr, s.forms) : ''].filter(Boolean).join(' '))
  })
  return (negative ? 'минус ' : '') + parts.join(' ')
}

export function amountInWordsRu(value: number): string {
  const { n } = normalize(value)
  return capitalize(`${numberToWordsRu(value)} ${ruPlural(n % 1000, RU_SUM)}`)
}

/** Both variants for document placeholders. */
export const amountWords = (value: number) => ({ amountInWords: amountInWordsUz(value), amountInWordsRu: amountInWordsRu(value) })
