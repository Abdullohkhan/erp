import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { amountInWordsRu, amountInWordsUz, numberToWordsRu, numberToWordsUz, ruPlural } from '../src/documents/amount-words.js'

describe('amount in words: Uzbek (Latin)', () => {
  const cases: [number, string][] = [
    [0, 'nol'],
    [1, 'bir'],
    [10, "o'n"],
    [11, "o'n bir"],
    [19, "o'n to'qqiz"],
    [40, 'qirq'],
    [99, "to'qson to'qqiz"],
    [100, 'bir yuz'],
    [105, 'bir yuz besh'],
    [999, "to'qqiz yuz to'qson to'qqiz"],
    [1000, 'bir ming'],
    [1001, 'bir ming bir'],
    [2024, "ikki ming yigirma to'rt"],
    [12_000, "o'n ikki ming"],
    [100_000, 'bir yuz ming'],
    [1_000_000, 'bir million'],
    [1_000_500, 'bir million besh yuz'],
    [1_250_000, 'bir million ikki yuz ellik ming'],
    [22_800_000, 'yigirma ikki million sakkiz yuz ming'],
    [3_000_000_000, 'uch milliard'],
    [1_000_000_000_001, 'bir trillion bir'],
  ]
  for (const [n, words] of cases) it(`${n}`, () => assert.equal(numberToWordsUz(n), words))

  it("adds so'm and capitalizes", () => {
    assert.equal(amountInWordsUz(1_250_000), "Bir million ikki yuz ellik ming so'm")
    assert.equal(amountInWordsUz(0), "Nol so'm")
  })
  it('rounds to whole so\'m and handles negatives', () => {
    assert.equal(amountInWordsUz(99.6), "Bir yuz so'm")
    assert.equal(amountInWordsUz(-5), "Minus besh so'm")
    assert.equal(amountInWordsUz(-0.2), "Nol so'm")
  })
  it('rejects invalid input', () => {
    assert.throws(() => amountInWordsUz(Number.NaN), RangeError)
    assert.throws(() => amountInWordsUz(1e16), RangeError)
  })
})

describe('amount in words: Russian', () => {
  const cases: [number, string][] = [
    [0, 'ноль'],
    [1, 'один'],
    [2, 'два'],
    [11, 'одиннадцать'],
    [15, 'пятнадцать'],
    [21, 'двадцать один'],
    [100, 'сто'],
    [212, 'двести двенадцать'],
    [1000, 'одна тысяча'],
    [2000, 'две тысячи'],
    [5000, 'пять тысяч'],
    [11_000, 'одиннадцать тысяч'],
    [21_000, 'двадцать одна тысяча'],
    [22_000, 'двадцать две тысячи'],
    [1_000_000, 'один миллион'],
    [2_000_000, 'два миллиона'],
    [5_000_000, 'пять миллионов'],
    [1_250_000, 'один миллион двести пятьдесят тысяч'],
    [2_000_000_000, 'два миллиарда'],
    [1_000_001, 'один миллион один'],
  ]
  for (const [n, words] of cases) it(`${n}`, () => assert.equal(numberToWordsRu(n), words))

  it('currency agrees with the number', () => {
    assert.equal(amountInWordsRu(1), 'Один сум')
    assert.equal(amountInWordsRu(3), 'Три сума')
    assert.equal(amountInWordsRu(5), 'Пять сумов')
    assert.equal(amountInWordsRu(11), 'Одиннадцать сумов')
    assert.equal(amountInWordsRu(21), 'Двадцать один сум')
    assert.equal(amountInWordsRu(1000), 'Одна тысяча сумов')
    assert.equal(amountInWordsRu(1_250_000), 'Один миллион двести пятьдесят тысяч сумов')
    assert.equal(amountInWordsRu(0), 'Ноль сумов')
    assert.equal(amountInWordsRu(-2), 'Минус два сума')
  })
  it('plural rules', () => {
    const f: [string, string, string] = ['a', 'b', 'c']
    assert.deepEqual([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map((n) => ruPlural(n, f)), ['a', 'b', 'b', 'c', 'c', 'c', 'c', 'a', 'b', 'c', 'a', 'c'])
  })
})
