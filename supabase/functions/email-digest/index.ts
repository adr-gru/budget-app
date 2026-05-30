// Hourly cron: send finance digest emails based on each user's email_digest_settings.
//
// Required Supabase secrets:
//   RESEND_API_KEY  — API key from resend.com
//   RESEND_FROM     — Verified sender address (e.g. "digest@yourdomain.com")
//                     Defaults to "onboarding@resend.dev" for testing.
//
// Schedule SQL (run once in Supabase SQL Editor):
//   select cron.schedule(
//     'email-digest-hourly', '0 * * * *',
//     $$ select net.http_post(
//       url := 'https://<project>.functions.supabase.co/email-digest',
//       headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
//     ) $$
//   );

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const resendApiKey   = Deno.env.get('RESEND_API_KEY')!
const fromAddress    = Deno.env.get('RESEND_FROM') ?? 'onboarding@resend.dev'

const admin = createClient(supabaseUrl, serviceRoleKey)

interface SectionsConfig {
  balances:      boolean
  subscriptions: boolean
  budget:        boolean
  goals:         boolean
  credit_cards:  boolean
}

interface DigestRow {
  user_id:      string
  frequency:    'daily' | 'weekly' | 'monthly'
  send_day:     number | null
  send_hour:    number
  recipients:   string[]
  detail_level: 'summary' | 'detailed'
  sections:     SectionsConfig
  last_sent_at: string | null
}

function fmt(cents: number): string {
  const abs  = Math.abs(cents) / 100
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function cycleStartFromAnchor(anchor: string): string {
  const anchorDate = new Date(anchor + 'T00:00:00Z')
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const daysDiff = Math.floor((today.getTime() - anchorDate.getTime()) / 86400000)
  const periods  = Math.max(0, Math.floor(daysDiff / 14))
  const start    = new Date(anchorDate)
  start.setUTCDate(start.getUTCDate() + periods * 14)
  return isoDate(start)
}

function fmtDate(iso: string): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [, m, d] = iso.split('-')
  return `${months[Number(m) - 1]} ${Number(d)}`
}

async function buildHtml(userId: string, row: DigestRow, now: Date): Promise<string> {
  const sc = row.sections
  const isDetailed = row.detail_level === 'detailed'

  // Parallel data fetching
  const [accountsRes, subsRes, goalsRes, profileRes] = await Promise.all([
    sc.balances || sc.credit_cards
      ? admin.from('accounts')
          .select('id, name, type, due_day, credit_limit_cents')
          .eq('user_id', userId)
          .eq('archived', false)
          .order('sort_order')
      : Promise.resolve({ data: [] }),
    sc.subscriptions
      ? admin.from('subscriptions')
          .select('name, amount_cents, next_charge_on')
          .eq('user_id', userId)
          .eq('active', true)
          .gte('next_charge_on', isoDate(now))
          .lte('next_charge_on', isoDate(addDays(now, 7)))
          .order('next_charge_on')
      : Promise.resolve({ data: [] }),
    sc.goals
      ? admin.from('goals')
          .select('name, target_cents, current_cents')
          .eq('user_id', userId)
          .order('sort_order')
      : Promise.resolve({ data: [] }),
    sc.budget || sc.balances
      ? admin.from('profile')
          .select('paycheck_cents, needs_pct, wants_pct, savings_pct, cycle_anchor_date')
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const accounts = (accountsRes.data ?? []) as { id: string; name: string; type: string; due_day: number | null; credit_limit_cents: number | null }[]
  const subs     = (subsRes.data    ?? []) as { name: string; amount_cents: number; next_charge_on: string }[]
  const goals    = (goalsRes.data   ?? []) as { name: string; target_cents: number; current_cents: number }[]
  const profile  = (profileRes.data ?? null) as { paycheck_cents: number; needs_pct: number; wants_pct: number; savings_pct: number; cycle_anchor_date: string } | null

  // Latest balances
  const balanceMap = new Map<string, number>()
  if ((sc.balances || sc.credit_cards) && accounts.length > 0) {
    const { data: balances } = await admin
      .from('latest_account_balances')
      .select('account_id, balance_cents')
      .in('account_id', accounts.map(a => a.id))
    for (const b of (balances ?? [])) balanceMap.set(b.account_id, b.balance_cents)
  }

  // Cycle spending
  const cycleSpend = new Map<string, number>()
  if (sc.budget && profile?.cycle_anchor_date) {
    const cs  = cycleStartFromAnchor(profile.cycle_anchor_date)
    const ce  = isoDate(addDays(new Date(cs + 'T00:00:00Z'), 13))
    const { data: txns } = await admin
      .from('transactions')
      .select('bucket, amount_cents')
      .eq('user_id', userId)
      .eq('is_income', false)
      .gte('date', cs)
      .lte('date', ce)
    for (const t of (txns ?? [])) cycleSpend.set(t.bucket, (cycleSpend.get(t.bucket) ?? 0) + t.amount_cents)
  }

  // Net worth
  let totalAssets = 0, totalDebt = 0
  for (const a of accounts) {
    const bal = balanceMap.get(a.id) ?? 0
    if (a.type === 'credit_card') totalDebt += bal
    else totalAssets += bal
  }
  const netWorth = totalAssets - totalDebt

  // Credit cards due in next 7 days
  const todayMs = now.getTime()
  const dueSoonCards = accounts
    .filter(a => a.type === 'credit_card' && a.due_day !== null)
    .map(a => {
      const yr = now.getUTCFullYear(), mo = now.getUTCMonth()
      let d = new Date(Date.UTC(yr, mo, a.due_day!))
      if (d.getTime() < todayMs) d = new Date(Date.UTC(yr, mo + 1, a.due_day!))
      const daysUntil = Math.round((d.getTime() - todayMs) / 86400000)
      return { name: a.name, daysUntil, iso: isoDate(d) }
    })
    .filter(c => c.daysUntil <= 7)
    .sort((a, b) => a.daysUntil - b.daysUntil)

  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
  const parts: string[] = []

  // ── Net worth hero ──────────────────────────────────────────────────────────
  const nwColor = netWorth >= 0 ? '#16a34a' : '#dc2626'
  parts.push(`
    <tr><td style="padding:24px 32px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:10px;">
        <tr><td style="padding:20px 24px;">
          <div style="color:#71717a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;">Net Worth</div>
          <div style="color:${nwColor};font-size:32px;font-weight:700;margin-top:6px;font-variant-numeric:tabular-nums;">${fmt(netWorth)}</div>
          <div style="color:#71717a;font-size:12px;margin-top:4px;">Assets ${fmt(totalAssets)} &nbsp;·&nbsp; Debt ${fmt(totalDebt)}</div>
        </td></tr>
      </table>
    </td></tr>`)

  // ── Account balances ────────────────────────────────────────────────────────
  if (sc.balances && accounts.length > 0 && isDetailed) {
    parts.push(`
      <tr><td style="padding:20px 32px 0;">
        <div style="color:#71717a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Account Balances</div>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${accounts.map(a => {
            const bal = balanceMap.get(a.id)
            const isCC = a.type === 'credit_card'
            return `<tr>
              <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#18181b;font-size:14px;">${a.name}${isCC ? ' <span style="color:#71717a;font-size:12px;">(credit)</span>' : ''}</td>
              <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#18181b;font-size:14px;text-align:right;font-variant-numeric:tabular-nums;">${bal != null ? fmt(bal) : '—'}</td>
            </tr>`
          }).join('')}
        </table>
      </td></tr>`)
  }

  // ── Upcoming payments ───────────────────────────────────────────────────────
  const hasUpcoming = (sc.subscriptions && subs.length > 0) || (sc.credit_cards && dueSoonCards.length > 0)
  if (hasUpcoming) {
    if (!isDetailed) {
      const count    = subs.length + dueSoonCards.length
      const subTotal = subs.reduce((s, x) => s + x.amount_cents, 0)
      parts.push(`
        <tr><td style="padding:20px 32px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9c3;border-radius:10px;">
            <tr><td style="padding:16px 20px;">
              <div style="color:#854d0e;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;">Upcoming This Week</div>
              <div style="color:#713f12;font-size:18px;font-weight:600;margin-top:4px;">${count} payment${count !== 1 ? 's' : ''}&nbsp;·&nbsp;${fmt(subTotal)}</div>
            </td></tr>
          </table>
        </td></tr>`)
    } else {
      parts.push(`
        <tr><td style="padding:20px 32px 0;">
          <div style="color:#71717a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Upcoming Payments</div>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${sc.subscriptions ? subs.map(s => `
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#18181b;font-size:14px;">${s.name}</td>
                <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#71717a;font-size:13px;text-align:center;">${fmtDate(s.next_charge_on)}</td>
                <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#18181b;font-size:14px;text-align:right;font-variant-numeric:tabular-nums;">${fmt(s.amount_cents)}</td>
              </tr>`).join('') : ''}
            ${sc.credit_cards ? dueSoonCards.map(c => `
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#18181b;font-size:14px;">${c.name} payment</td>
                <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#71717a;font-size:13px;text-align:center;">Due ${fmtDate(c.iso)}</td>
                <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#71717a;font-size:13px;text-align:right;">—</td>
              </tr>`).join('') : ''}
          </table>
        </td></tr>`)
    }
  }

  // ── Budget ──────────────────────────────────────────────────────────────────
  if (sc.budget && profile) {
    const cycleBudget   = profile.paycheck_cents
    const needsBudget   = Math.round(cycleBudget * profile.needs_pct   / 100)
    const wantsBudget   = Math.round(cycleBudget * profile.wants_pct   / 100)
    const savingsBudget = Math.round(cycleBudget * profile.savings_pct / 100)
    const needsSpent    = cycleSpend.get('needs')   ?? 0
    const wantsSpent    = cycleSpend.get('wants')   ?? 0
    const savingsSpent  = cycleSpend.get('savings') ?? 0

    if (!isDetailed) {
      const totalSpent  = needsSpent + wantsSpent + savingsSpent
      const pct = cycleBudget > 0 ? Math.round(totalSpent / cycleBudget * 100) : 0
      parts.push(`
        <tr><td style="padding:20px 32px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:10px;">
            <tr><td style="padding:16px 20px;">
              <div style="color:#166534;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;">Budget This Cycle</div>
              <div style="color:#14532d;font-size:18px;font-weight:600;margin-top:4px;">${pct}% used&nbsp;·&nbsp;${fmt(totalSpent)} of ${fmt(cycleBudget)}</div>
            </td></tr>
          </table>
        </td></tr>`)
    } else {
      const buckets = [
        { label: 'Needs',   spent: needsSpent,   budget: needsBudget   },
        { label: 'Wants',   spent: wantsSpent,   budget: wantsBudget   },
        { label: 'Savings', spent: savingsSpent, budget: savingsBudget },
      ]
      parts.push(`
        <tr><td style="padding:20px 32px 0;">
          <div style="color:#71717a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Budget This Cycle</div>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${buckets.map(b => {
              const pct      = b.budget > 0 ? Math.min(100, Math.round(b.spent / b.budget * 100)) : 0
              const barColor = pct > 90 ? '#dc2626' : pct > 70 ? '#d97706' : '#16a34a'
              return `<tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#18181b;font-size:13px;">${b.label}</td>
                    <td style="color:#71717a;font-size:12px;text-align:right;font-variant-numeric:tabular-nums;">${fmt(b.spent)} / ${fmt(b.budget)}</td>
                  </tr>
                  <tr><td colspan="2" style="padding-top:4px;">
                    <div style="background:#e5e7eb;height:4px;border-radius:2px;">
                      <div style="background:${barColor};height:4px;width:${pct}%;border-radius:2px;max-width:100%;"></div>
                    </div>
                  </td></tr>
                </table>
              </td></tr>`
            }).join('')}
          </table>
        </td></tr>`)
    }
  }

  // ── Goals ───────────────────────────────────────────────────────────────────
  if (sc.goals && goals.length > 0) {
    if (!isDetailed) {
      const avgPct = Math.round(
        goals.reduce((s, g) => s + (g.target_cents > 0 ? g.current_cents / g.target_cents * 100 : 0), 0) / goals.length
      )
      parts.push(`
        <tr><td style="padding:20px 32px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:10px;">
            <tr><td style="padding:16px 20px;">
              <div style="color:#1e40af;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;">Goals</div>
              <div style="color:#1e3a8a;font-size:18px;font-weight:600;margin-top:4px;">${goals.length} goal${goals.length !== 1 ? 's' : ''}&nbsp;·&nbsp;${avgPct}% avg progress</div>
            </td></tr>
          </table>
        </td></tr>`)
    } else {
      parts.push(`
        <tr><td style="padding:20px 32px 0;">
          <div style="color:#71717a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Goals</div>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${goals.map(g => {
              const pct = g.target_cents > 0 ? Math.min(100, Math.round(g.current_cents / g.target_cents * 100)) : 0
              return `<tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#18181b;font-size:13px;">${g.name}</td>
                    <td style="color:#71717a;font-size:12px;text-align:right;">${pct}%&nbsp;·&nbsp;${fmt(g.current_cents)} / ${fmt(g.target_cents)}</td>
                  </tr>
                  <tr><td colspan="2" style="padding-top:4px;">
                    <div style="background:#e5e7eb;height:4px;border-radius:2px;">
                      <div style="background:#3b82f6;height:4px;width:${pct}%;border-radius:2px;max-width:100%;"></div>
                    </div>
                  </td></tr>
                </table>
              </td></tr>`
            }).join('')}
          </table>
        </td></tr>`)
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <tr>
          <td style="background:#18181b;padding:28px 32px;">
            <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-.01em;">Finance Digest</div>
            <div style="color:#a1a1aa;font-size:13px;margin-top:4px;">${dateStr}</div>
          </td>
        </tr>
        ${parts.join('\n')}
        <tr><td style="padding:24px 32px;">
          <div style="border-top:1px solid #f0f0f0;padding-top:16px;">
            <p style="color:#a1a1aa;font-size:11px;margin:0;line-height:1.5;">You're receiving this because you enabled email digests in your budget app. Manage your preferences in Settings.</p>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const now             = new Date()
  const nowUtcHour      = now.getUTCHours()
  const nowUtcDayOfWeek = now.getUTCDay()
  const nowUtcDayOfMon  = now.getUTCDate()

  const { data: allSettings, error } = await admin
    .from('email_digest_settings')
    .select('*')
    .eq('enabled', true)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    })
  }

  const qualifying = (allSettings ?? []).filter((s: DigestRow) => {
    if (!s.recipients?.length) return false
    if (s.send_hour !== nowUtcHour) return false
    if (s.frequency === 'weekly'  && s.send_day !== null && s.send_day !== nowUtcDayOfWeek) return false
    if (s.frequency === 'monthly' && s.send_day !== null && s.send_day !== nowUtcDayOfMon)  return false
    if (s.last_sent_at) {
      const elapsed    = (now.getTime() - new Date(s.last_sent_at).getTime()) / 3600000
      const minElapsed = s.frequency === 'daily' ? 20 : s.frequency === 'weekly' ? 144 : 660
      if (elapsed < minElapsed) return false
    }
    return true
  })

  let sent = 0

  for (const row of qualifying) {
    try {
      const html    = await buildHtml(row.user_id, row, now)
      const subject = `Finance Digest — ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`

      for (const to of row.recipients) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: fromAddress, to, subject, html })
        })
        if (res.ok) sent++
      }

      await admin
        .from('email_digest_settings')
        .update({ last_sent_at: now.toISOString(), updated_at: now.toISOString() })
        .eq('user_id', row.user_id)
    } catch (err) {
      console.error(`Failed digest for user ${row.user_id}:`, err)
    }
  }

  return new Response(
    JSON.stringify({ sent, evaluated: allSettings?.length ?? 0, qualifying: qualifying.length }),
    { headers: { 'content-type': 'application/json' } }
  )
})
