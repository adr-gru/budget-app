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
  source:         'recurring' | 'category'
}

// PFC detailed values that strongly indicate a recurring subscription
const SUBSCRIPTION_PFC_DETAILED = new Set([
  'ENTERTAINMENT_TV_AND_MOVIES',
  'ENTERTAINMENT_MUSIC_AND_AUDIO',
  'ENTERTAINMENT_VIDEO_GAMES',
  'ENTERTAINMENT_OTHER_ENTERTAINMENT',
  'RENT_AND_UTILITIES_INTERNET_AND_CABLE',
  'RENT_AND_UTILITIES_TELEPHONE',
  'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS',
  'GENERAL_SERVICES_INSURANCE',
  'GENERAL_SERVICES_ONLINE_MARKETPLACE',
  'GENERAL_SERVICES_SUBSCRIPTION',
])

export function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[*#]/g, '')
    .replace(/\d{4,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Grouping key: prefer clean merchant_name, fall back to normalized description
function groupKey(tx: Transaction): string {
  if (tx.merchant_name) return tx.merchant_name.toLowerCase().trim()
  return normalizeDescription(tx.description)
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
    const key = groupKey(tx)
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
    const latest   = sorted[sorted.length - 1]
    results.push({
      name:           latest.merchant_name ?? latest.description,
      amount_cents:   medianAmount,
      cadence,
      bucket:         bestBucket,
      last_seen:      lastSeen,
      occurrences:    txs.length,
      next_charge_on: inferNextCharge(lastSeen, cadence),
      source:         'recurring',
    })
  }

  return results.sort((a, b) => b.occurrences - a.occurrences || b.last_seen.localeCompare(a.last_seen))
}

// Single-occurrence hints for transactions in subscription-leaning categories
export function detectByCategory(
  transactions: Transaction[],
  excludeKeys: Set<string>
): SuggestedSubscription[] {
  const expenses = transactions.filter(tx => tx.amount_cents > 0 && tx.pfc_detailed)

  const groups = new Map<string, Transaction[]>()
  for (const tx of expenses) {
    if (!SUBSCRIPTION_PFC_DETAILED.has(tx.pfc_detailed!)) continue
    const key = groupKey(tx)
    if (!key || excludeKeys.has(key)) continue
    const list = groups.get(key) ?? []
    list.push(tx)
    groups.set(key, list)
  }

  const results: SuggestedSubscription[] = []

  for (const [, txs] of groups) {
    const sorted   = [...txs].sort((a, b) => a.date.localeCompare(b.date))
    const latest   = sorted[sorted.length - 1]
    const amounts  = sorted.map(t => t.amount_cents)
    const sortedAmt = [...amounts].sort((a, b) => a - b)
    const medianAmount = sortedAmt[Math.floor(sortedAmt.length / 2)]

    results.push({
      name:           latest.merchant_name ?? latest.description,
      amount_cents:   medianAmount,
      cadence:        'monthly',
      bucket:         latest.bucket === 'uncategorized' ? 'wants' : (latest.bucket as TransactionBucket),
      last_seen:      latest.date,
      occurrences:    txs.length,
      next_charge_on: inferNextCharge(latest.date, 'monthly'),
      source:         'category',
    })
  }

  return results.sort((a, b) => b.last_seen.localeCompare(a.last_seen))
}
