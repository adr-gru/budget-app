// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ONE_HOUR_MS = 60 * 60 * 1000

function tellerAuth(accessToken: string) {
  return `Basic ${btoa(`${accessToken}:`)}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get all Teller-linked accounts for this user
    const { data: linkedAccounts, error: acctErr } = await adminClient
      .from('accounts')
      .select('id, type, teller_account_id, teller_enrollment_id')
      .eq('user_id', user.id)
      .eq('archived', false)
      .not('teller_enrollment_id', 'is', null)

    if (acctErr) throw acctErr
    if (!linkedAccounts || linkedAccounts.length === 0) return json({ synced: 0 })

    let synced = 0

    for (const acct of linkedAccounts) {
      if (!acct.teller_account_id || !acct.teller_enrollment_id) continue

      // Check if last snapshot is < 1 hour old
      const { data: recent } = await adminClient
        .from('account_balance_snapshots')
        .select('recorded_at')
        .eq('account_id', acct.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (recent) {
        const age = Date.now() - new Date(recent.recorded_at).getTime()
        if (age < ONE_HOUR_MS) continue
      }

      // Get access token for this enrollment
      const { data: enrollment } = await adminClient
        .from('teller_enrollments')
        .select('teller_access_token')
        .eq('id', acct.teller_enrollment_id)
        .single()

      if (!enrollment) continue

      // Fetch balance from Teller
      const balResp = await fetch(
        `https://api.teller.io/accounts/${acct.teller_account_id}/balances`,
        { headers: { Authorization: tellerAuth(enrollment.teller_access_token) } }
      )

      if (!balResp.ok) continue

      const bal: any = await balResp.json()

      // Choose balance field based on account type
      let balanceDollars: number | null = null
      if (acct.type === 'credit_card') {
        // For credit: ledger = total owed
        balanceDollars = parseFloat(bal.ledger ?? '0')
      } else if (acct.type === 'checking' || acct.type === 'savings') {
        // Prefer available (excludes pending), fall back to ledger
        balanceDollars = parseFloat(bal.available ?? bal.ledger ?? '0')
      } else {
        // Investment
        balanceDollars = parseFloat(bal.ledger ?? '0')
      }

      if (isNaN(balanceDollars) || balanceDollars < 0) balanceDollars = 0

      const balanceCents = Math.round(balanceDollars * 100)

      await adminClient.from('account_balance_snapshots').insert({
        account_id: acct.id,
        user_id: user.id,
        balance_cents: balanceCents,
      })

      await adminClient
        .from('accounts')
        .update({ teller_last_synced_at: new Date().toISOString() })
        .eq('id', acct.id)

      synced++
    }

    return json({ synced })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
