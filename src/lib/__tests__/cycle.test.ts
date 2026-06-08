import { describe, it, expect } from 'vitest'
import { format } from 'date-fns'
import { currentCycleStart, cycleEnd, cycleLabel, dateInCycle, prevCycle, nextCycle } from '../cycle'

// Use local-time construction to avoid UTC-vs-local timezone shifts in test assertions
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

describe('cycleEnd', () => {
  it('is 13 days after start (inclusive 14-day period)', () => {
    const start = d(2024, 1, 1)
    const end   = cycleEnd(start)
    const diff  = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    expect(diff).toBe(13)
  })
})

describe('prevCycle / nextCycle', () => {
  it('prev + next returns original', () => {
    const start = d(2024, 3, 15)
    expect(format(nextCycle(prevCycle(start)), 'yyyy-MM-dd')).toBe(format(start, 'yyyy-MM-dd'))
  })

  it('each step is exactly 14 days', () => {
    const start = d(2024, 1, 1)
    const next  = nextCycle(start)
    const diff  = (next.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    expect(diff).toBe(14)
  })
})

describe('cycleLabel', () => {
  it('omits month on end when same month', () => {
    const start = d(2024, 1, 1)
    expect(cycleLabel(start)).toBe('Jan 1 – 14')
  })

  it('includes month on end when crossing months', () => {
    const start = d(2024, 1, 25)
    expect(cycleLabel(start)).toBe('Jan 25 – Feb 7')
  })
})

describe('dateInCycle', () => {
  it('returns true for dates within the cycle', () => {
    const start = d(2024, 6, 1)
    expect(dateInCycle('2024-06-01', start)).toBe(true)
    expect(dateInCycle('2024-06-07', start)).toBe(true)
    expect(dateInCycle('2024-06-14', start)).toBe(true)
  })

  it('returns false for dates outside the cycle', () => {
    const start = d(2024, 6, 1)
    expect(dateInCycle('2024-05-31', start)).toBe(false)
    expect(dateInCycle('2024-06-15', start)).toBe(false)
  })
})

describe('currentCycleStart', () => {
  it('returns a date that is a multiple of 14 days from the anchor', () => {
    const anchor = '2024-01-01'
    const start  = currentCycleStart(anchor)
    const anchorDate = d(2024, 1, 1)
    const diff = Math.round((start.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24))
    expect(diff % 14).toBe(0)
  })
})
