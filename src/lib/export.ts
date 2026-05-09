import type { Account, BalanceSnapshot, Subscription, Goal, GoalContribution } from './supabase'
import { formatMoney } from './money'
import { format, parseISO } from 'date-fns'

function csvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(f => {
    const s = String(f ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }).join(',')
}

function downloadCSV(filename: string, rows: string[]) {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportAccounts(accounts: Account[]) {
  const header = csvRow(['Name', 'Type', 'Credit Limit', 'Due Day', 'Created'])
  const rows = accounts.map(a =>
    csvRow([
      a.name,
      a.type,
      a.credit_limit_cents != null ? formatMoney(a.credit_limit_cents) : '',
      a.due_day ?? '',
      format(parseISO(a.created_at), 'yyyy-MM-dd')
    ])
  )
  downloadCSV(`accounts-${format(new Date(), 'yyyy-MM-dd')}.csv`, [header, ...rows])
}

export function exportSnapshots(snapshots: BalanceSnapshot[], accounts: Account[]) {
  const accountMap = new Map(accounts.map(a => [a.id, a.name]))
  const header = csvRow(['Account', 'Balance', 'Recorded At'])
  const rows = snapshots
    .slice()
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
    .map(s =>
      csvRow([
        accountMap.get(s.account_id) ?? s.account_id,
        formatMoney(s.balance_cents),
        format(parseISO(s.recorded_at), 'yyyy-MM-dd HH:mm')
      ])
    )
  downloadCSV(`balances-${format(new Date(), 'yyyy-MM-dd')}.csv`, [header, ...rows])
}

export function exportSubscriptions(subs: Subscription[]) {
  const header = csvRow(['Name', 'Amount', 'Cadence', 'Bucket', 'Next Charge', 'Active'])
  const rows = subs.map(s =>
    csvRow([
      s.name,
      formatMoney(s.amount_cents),
      s.cadence,
      s.bucket,
      s.next_charge_on,
      s.active ? 'Yes' : 'No'
    ])
  )
  downloadCSV(`subscriptions-${format(new Date(), 'yyyy-MM-dd')}.csv`, [header, ...rows])
}

export function exportGoals(goals: Goal[]) {
  const header = csvRow(['Name', 'Target Amount', 'Target Date', 'Created'])
  const rows = goals.map(g =>
    csvRow([
      g.name,
      formatMoney(g.target_cents),
      g.target_date ?? '',
      format(parseISO(g.created_at), 'yyyy-MM-dd')
    ])
  )
  downloadCSV(`goals-${format(new Date(), 'yyyy-MM-dd')}.csv`, [header, ...rows])
}

export function exportContributions(contributions: GoalContribution[], goals: Goal[]) {
  const goalMap = new Map(goals.map(g => [g.id, g.name]))
  const header = csvRow(['Goal', 'Amount', 'Date', 'Source', 'Note'])
  const rows = contributions
    .slice()
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
    .map(c =>
      csvRow([
        goalMap.get(c.goal_id) ?? c.goal_id,
        formatMoney(c.amount_cents),
        c.occurred_on,
        c.source,
        c.note ?? ''
      ])
    )
  downloadCSV(`contributions-${format(new Date(), 'yyyy-MM-dd')}.csv`, [header, ...rows])
}
