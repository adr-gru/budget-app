// Daily cron: send push notifications for subscription renewals (2 days out)
// and credit card due dates (3 days out). Run once at 9am UTC; per-user TZ
// scheduling deferred.
//
// Required Supabase secrets: APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID
// Required extensions: pg_cron, pg_net
//
// Schedule SQL (run once in Supabase SQL Editor):
//   select cron.schedule(
//     'notify-cron-daily', '0 9 * * *',
//     $$ select net.http_post(
//       url := 'https://<project>.functions.supabase.co/notify-cron',
//       headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
//     ) $$
//   );

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendApns } from './apns.ts'

const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(supabaseUrl, serviceRoleKey)

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const today = new Date()
  const in2   = isoDate(addDays(today, 2))
  const in3   = addDays(today, 3).getDate()

  // Subscriptions renewing in exactly 2 days
  const { data: subs } = await admin
    .from('subscriptions')
    .select('user_id, name, amount_cents, next_charge_on')
    .eq('next_charge_on', in2)
    .eq('active', true)

  // Credit cards with due_day matching 3 days from now
  const { data: cards } = await admin
    .from('accounts')
    .select('user_id, name, due_day')
    .eq('type', 'credit_card')
    .eq('archived', false)
    .eq('due_day', in3)

  const userSubMap   = new Map<string, typeof subs>()
  const userCardMap  = new Map<string, typeof cards>()

  for (const s of subs  ?? []) {
    const arr = userSubMap.get(s.user_id) ?? []
    arr.push(s)
    userSubMap.set(s.user_id, arr)
  }
  for (const c of cards ?? []) {
    const arr = userCardMap.get(c.user_id) ?? []
    arr.push(c)
    userCardMap.set(c.user_id, arr)
  }

  const userIds = new Set([...userSubMap.keys(), ...userCardMap.keys()])

  let sent = 0
  for (const userId of userIds) {
    const { data: tokens } = await admin
      .from('device_tokens')
      .select('token, platform')
      .eq('user_id', userId)

    if (!tokens?.length) continue

    const userSubs  = userSubMap.get(userId)  ?? []
    const userCards = userCardMap.get(userId) ?? []

    const lines: string[] = []
    for (const s of userSubs)  lines.push(`${s.name} renews tomorrow`)
    for (const c of userCards) lines.push(`${c.name} payment due in 3 days`)

    const body = lines.join('\n')
    const title = lines.length === 1 ? lines[0] : `${lines.length} upcoming payments`

    for (const t of tokens) {
      if (t.platform !== 'ios') continue
      await sendApns(t.token, {
        aps: { alert: { title, body }, sound: 'default', badge: lines.length }
      })
      sent++
    }
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { 'content-type': 'application/json' }
  })
})
