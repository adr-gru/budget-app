// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Maps Plaid primary + detailed categories to 50/30/20 buckets.
// Detailed category takes precedence when present.
function categorizePlaid(primary: string, detailed: string): 'needs' | 'wants' | 'savings' | 'uncategorized' {
  // Groceries = needs; restaurants/bars/coffee = wants
  if (primary === 'FOOD_AND_DRINK') {
    return detailed.includes('GROCERIES') ? 'needs' : 'wants'
  }
  const NEEDS = ['TRANSPORTATION', 'UTILITIES', 'RENT_AND_UTILITIES', 'HEALTHCARE', 'GENERAL_SERVICES', 'INSURANCE']
  const WANTS = ['ENTERTAINMENT', 'PERSONAL_CARE', 'SHOPPING', 'TRAVEL', 'RECREATION', 'RESTAURANTS']
  const SAVINGS = ['TRANSFER_OUT', 'LOAN_PAYMENTS', 'INVESTMENTS', 'SAVINGS']

  if (NEEDS.some(k => primary.startsWith(k) || detailed.startsWith(k))) return 'needs'
  if (WANTS.some(k => primary.startsWith(k) || detailed.startsWith(k))) return 'wants'
  if (SAVINGS.some(k => primary.startsWith(k) || detailed.startsWith(k))) return 'savings'
  return 'uncategorized'
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

    // Get linked accounts grouped by plaid_item_id
    const { data: linkedAccounts, error: acctErr } = await adminClient
      .from('accounts')
      .select('id, plaid_account_id, plaid_item_id')
      .eq('user_id', user.id)
      .eq('archived', false)
      .not('plaid_item_id', 'is', null)

    if (acctErr) throw acctErr
    if (!linkedAccounts || linkedAccounts.length === 0) return json({ imported: 0 })

    // Build account lookup: plaid_account_id → app account_id
    const accountIdByPlaid = new Map<string, string>()
    for (const a of linkedAccounts) {
      if (a.plaid_account_id) accountIdByPlaid.set(a.plaid_account_id, a.id)
    }

    const byItem = new Map<string, string[]>()
    for (const a of linkedAccounts) {
      const key = a.plaid_item_id as string
      const group = byItem.get(key) ?? []
      if (a.plaid_account_id) group.push(a.plaid_account_id)
      byItem.set(key, group)
    }

    const plaidEnv  = Deno.env.get('PLAID_ENV') ?? 'development'
    const plaidBase = `https://${plaidEnv}.plaid.com`

    // Last 30 days
    const endDate   = new Date()
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000)
    const fmt = (d: Date) => d.toISOString().split('T')[0]

    let imported = 0

    for (const [itemDbId, plaidAccountIds] of byItem) {
      const { data: plaidItem } = await adminClient
        .from('plaid_items')
        .select('plaid_access_token')
        .eq('id', itemDbId)
        .single()
      if (!plaidItem) continue

      // Paginate transactions (max 500 per call)
      let offset = 0
      let totalTx = 0
      const allTx: any[] = []

      do {
        const txResp = await fetch(`${plaidBase}/transactions/get`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID')!,
            'PLAID-SECRET': Deno.env.get('PLAID_SECRET')!,
          },
          body: JSON.stringify({
            access_token: plaidItem.plaid_access_token,
            start_date: fmt(startDate),
            end_date: fmt(endDate),
            options: { count: 500, offset, account_ids: plaidAccountIds },
          }),
        })
        const txData: any = await txResp.json()
        if (txData.error_code) break
        totalTx = txData.total_transactions ?? 0
        allTx.push(...(txData.transactions ?? []))
        offset += txData.transactions?.length ?? 0
      } while (offset < totalTx && offset < 2000)

      // Build upsert rows — skip pending transactions
      const rows = allTx
        .filter((tx: any) => !tx.pending)
        .map((tx: any) => {
          const pfc     = tx.personal_finance_category ?? {}
          const primary = (pfc.primary ?? '') as string
          const detailed = (pfc.detailed ?? '') as string
          const appAccountId = accountIdByPlaid.get(tx.account_id) ?? null

          // Plaid amounts: positive = money out (debit/purchase), negative = money in (credit)
          const amountCents = Math.round(Math.abs(tx.amount as number) * 100)

          return {
            user_id: user.id,
            account_id: appAccountId,
            plaid_transaction_id: tx.transaction_id as string,
            amount_cents: amountCents,
            description: (tx.merchant_name ?? tx.name ?? '') as string,
            date: tx.date as string,
            bucket: categorizePlaid(primary, detailed),
            category_override: false,
          }
        })

      if (rows.length === 0) continue

      // Upsert: on conflict (plaid_transaction_id) only update non-override rows
      const { data: existing } = await adminClient
        .from('transactions')
        .select('plaid_transaction_id, category_override')
        .in('plaid_transaction_id', rows.map(r => r.plaid_transaction_id))
        .eq('user_id', user.id)

      const overrideIds = new Set(
        (existing ?? []).filter((e: any) => e.category_override).map((e: any) => e.plaid_transaction_id)
      )

      // For overridden rows, preserve bucket; for new/non-overridden rows, upsert freely
      const insertRows = rows.filter(r => !overrideIds.has(r.plaid_transaction_id))
      const preserveRows = rows
        .filter(r => overrideIds.has(r.plaid_transaction_id))
        .map(r => ({ ...r, bucket: undefined })) // don't overwrite bucket

      if (insertRows.length > 0) {
        const { error: upsertErr } = await adminClient
          .from('transactions')
          .upsert(insertRows, { onConflict: 'plaid_transaction_id' })
        if (upsertErr) throw upsertErr
        imported += insertRows.length
      }

      // For override rows, only update non-bucket fields
      for (const r of preserveRows) {
        await adminClient
          .from('transactions')
          .update({
            description: r.description,
            amount_cents: r.amount_cents,
            date: r.date,
          })
          .eq('plaid_transaction_id', r.plaid_transaction_id)
          .eq('user_id', user.id)
      }
    }

    return json({ imported })
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
