import { describe, it, expect } from 'vitest'
import { formatMoney, parseCents, formatDollars } from '../money'

describe('formatMoney', () => {
  it('formats whole cents as dollars', () => {
    expect(formatMoney(100)).toBe('$1.00')
    expect(formatMoney(0)).toBe('$0.00')
    expect(formatMoney(123456)).toBe('$1,234.56')
  })

  it('formats negative values', () => {
    expect(formatMoney(-500)).toBe('-$5.00')
  })

  it('rounds correctly', () => {
    expect(formatMoney(1)).toBe('$0.01')
    expect(formatMoney(99)).toBe('$0.99')
  })
})

describe('parseCents', () => {
  it('parses plain dollar amounts', () => {
    expect(parseCents('1.00')).toBe(100)
    expect(parseCents('10')).toBe(1000)
    expect(parseCents('0.99')).toBe(99)
  })

  it('strips non-numeric characters', () => {
    expect(parseCents('$1,234.56')).toBe(123456)
    expect(parseCents('1,000')).toBe(100000)
  })

  it('returns 0 for empty or invalid input', () => {
    expect(parseCents('')).toBe(0)
    expect(parseCents('abc')).toBe(0)
  })

  it('handles sub-cent values', () => {
    expect(parseCents('1.004')).toBe(100)
    expect(parseCents('1.999')).toBe(200)
  })
})

describe('formatDollars', () => {
  it('formats cents as a decimal dollar string', () => {
    expect(formatDollars(100)).toBe('1.00')
    expect(formatDollars(0)).toBe('0.00')
    expect(formatDollars(99)).toBe('0.99')
  })
})
