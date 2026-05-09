import { differenceInCalendarDays, parseISO, addDays, addMonths, format } from 'date-fns'
import type { Transaction, SubCadence, TransactionBucket } from './supabase'

export interface SuggestedSubscription {
  name:           string
  amount_cents:   number
  cadence:        SubCadence
  bucket:         TransactionBucket
  last_seen:      string
  occurrences:    number
  next_charge_on: string
}

export function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[*#]/g, '')
    .replace(/\d{4,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferNextCharge(lastSeen: string, cadence: SubCadence): string {
  const d = parseISO(lastSeen)
  if (cadence === 'weekly')  return format(addDays(d, 7), 'yyyy-MM-dd')
  if (cadence === 'monthly') return format(addMonths(d, 1), 'yyyy-MM-dd')
  const next = new Date(d)
  next.setFullYear(next.getFullYear() + 1)
  return format(next, 'yyyy-MM-dd')
}

export function detectSubscriptions(
  transactions: Transaction[],
  existingNormalized: Set<string>
): SuggestedSubscription[] {
  const expenses = transactions.filter(tx => tx.amount_cents > 0)

  const groups = new Map<string, Transaction[]>()
  for (const tx of expenses) {
    const key = normalizeDescription(tx.description)
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(tx)
    groups.set(key, list)
  }

  const results: SuggestedSubscription[] = []

  for (const [key, txs] of groups) {
    if (txs.length < 2) continue
    if (existingNormalized.has(key)) continue

    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))
    const dates  = sorted.map(t => t.date)

    const gaps: number[] = []
    for (let i = 1; i < dates.length; i++) {
      gaps.push(differenceInCalendarDays(parseISO(dates[i]), parseISO(dates[i - 1])))
    }
    const sortedGaps = [...gaps].sort((a, b) => a - b)
    const median = sortedGaps[Math.floor(sortedGaps.length / 2)]

    let cadence: SubCadence | null = null
    if (median >= 6  && median <= 9)   cadence = 'weekly'
    else if (median >= 25 && median <= 35)  cadence = 'monthly'
    else if (median >= 355 && median <= 380) cadence = 'yearly'
    if (!cadence) continue

    const amounts       = sorted.map(t => t.amount_cents)
    const sortedAmounts = [...amounts].sort((a, b) => a - b)
    const medianAmount  = sortedAmounts[Math.floor(sortedAmounts.length / 2)]
    const allConsistent = amounts.every(a => medianAmount === 0 || Math.abs(a - medianAmount) / medianAmount < 0.25)
    if (!allConsistent) continue

    let bestBucket: TransactionBucket = 'wants'
    let bestCount = 0
    const bucketCounts = new Map<TransactionBucket, number>()
    for (const tx of txs) bucketCounts.set(tx.bucket, (bucketCounts.get(tx.bucket) ?? 0) + 1)
    for (const [b, count] of bucketCounts) {
      if (b !== 'uncategorized' && count > bestCount) { bestBucket = b; bestCount = count }
    }

    const lastSeen = dates[dates.length - 1]
    results.push({
      name:           sorted[sorted.length - 1].description,
      amount_cents:   medianAmount,
      cadence,
      bucket:         bestBucket,
      last_seen:      lastSeen,
      occurrences:    txs.length,
      next_charge_on: inferNextCharge(lastSeen, cadence)
    })
  }

  return results.sort((a, b) => b.occurrences - a.occurrences || b.last_seen.localeCompare(a.last_seen))
}
