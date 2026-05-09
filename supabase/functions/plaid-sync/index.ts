// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ONE_HOUR_MS = 60 * 60 * 1000

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

    // Get all plaid-linked active accounts for this user
    const { data: linkedAccounts, error: acctError } = await adminClient
      .from('accounts')
      .select('id, type, plaid_account_id, plaid_item_id')
      .eq('user_id', user.id)
      .eq('archived', false)
      .not('plaid_item_id', 'is', null)

    if (acctError) throw acctError
    if (!linkedAccounts || linkedAccounts.length === 0) return json({ synced: 0 })

    // Group accounts by plaid_item_id
    const byItem = new Map<string, typeof linkedAccounts>()
    for (const acct of linkedAccounts) {
      const key = acct.plaid_item_id as string
      const group = byItem.get(key) ?? []
      group.push(acct)
      byItem.set(key, group)
    }

    const plaidEnv  = Deno.env.get('PLAID_ENV') ?? 'development'
    const plaidBase = `https://${plaidEnv}.plaid.com`
    let synced = 0

    for (const [itemDbId, itemAccounts] of byItem) {
      // Get access token (service role bypasses RLS)
      const { data: plaidItem, error: itemErr } = await adminClient
        .from('plaid_items')
        .select('plaid_access_token')
        .eq('id', itemDbId)
        .single()
      if (itemErr || !plaidItem) continue

      // Fetch balances from Plaid
      const balResp = await fetch(`${plaidBase}/accounts/balance/get`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID')!,
          'PLAID-SECRET': Deno.env.get('PLAID_SECRET')!,
        },
        body: JSON.stringify({ access_token: plaidItem.plaid_access_token }),
      })
      const balData: any = await balResp.json()
      if (balData.error_code) continue

      const plaidAccountMap = new Map<string, any>()
      for (const pa of (balData.accounts ?? [])) {
        plaidAccountMap.set(pa.account_id, pa)
      }

      for (const acct of itemAccounts) {
        if (!acct.plaid_account_id) continue
        const pa = plaidAccountMap.get(acct.plaid_account_id)
        if (!pa) continue

        // Skip if last snapshot was < 1 hour ago
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

        // Compute balance based on account type
        const bal = pa.balances as { available: number | null; current: number | null }
        let balanceDollars: number | null = null
        if (acct.type === 'credit_card') {
          balanceDollars = bal.current
        } else if (acct.type === 'checking' || acct.type === 'savings') {
          balanceDollars = bal.available ?? bal.current
        } else {
          balanceDollars = bal.current
        }
        if (balanceDollars === null) continue

        const balanceCents = Math.max(0, Math.round(balanceDollars * 100))

        await adminClient.from('account_balance_snapshots').insert({
          account_id: acct.id,
          user_id: user.id,
          balance_cents: balanceCents,
        })

        // Update last synced timestamp on the account
        await adminClient
          .from('accounts')
          .update({ plaid_last_synced_at: new Date().toISOString() })
          .eq('id', acct.id)

        synced++
      }
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
