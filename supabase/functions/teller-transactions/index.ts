// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 90 days back
const CUTOFF_DAYS = 90

function tellerAuth(accessToken: string) {
  return `Basic ${btoa(`${accessToken}:`)}`
}

type TxBucket = 'needs' | 'wants' | 'savings' | 'uncategorized'

function categorize(category: string): TxBucket {
  const NEEDS  = ['groceries', 'health', 'insurance', 'loan', 'phone', 'utilities', 'transport', 'fuel', 'education', 'service']
  const WANTS  = ['bar', 'dining', 'clothing', 'electronics', 'entertainment', 'shopping', 'sport', 'travel', 'software', 'accommodation', 'charity', 'recreation']
  const SAVINGS = ['investment', 'savings']

  const c = category.toLowerCase()
  if (NEEDS.includes(c))   return 'needs'
  if (WANTS.includes(c))   return 'wants'
  if (SAVINGS.includes(c)) return 'savings'
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

    const { data: linkedAccounts, error: acctErr } = await adminClient
      .from('accounts')
      .select('id, type, teller_account_id, teller_enrollment_id')
      .eq('user_id', user.id)
      .eq('archived', false)
      .not('teller_enrollment_id', 'is', null)

    if (acctErr) throw acctErr
    if (!linkedAccounts || linkedAccounts.length === 0) return json({ imported: 0 })

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - CUTOFF_DAYS)
    const cutoffISO = cutoff.toISOString().split('T')[0]

    let imported = 0

    for (const acct of linkedAccounts) {
      if (!acct.teller_account_id || !acct.teller_enrollment_id) continue

      const { data: enrollment } = await adminClient
        .from('teller_enrollments')
        .select('teller_access_token')
        .eq('id', acct.teller_enrollment_id)
        .single()

      if (!enrollment) continue

      const txResp = await fetch(
        `https://api.teller.io/accounts/${acct.teller_account_id}/transactions`,
        { headers: { Authorization: tellerAuth(enrollment.teller_access_token) } }
      )

      if (!txResp.ok) continue

      const transactions: any[] = await txResp.json()

      // Filter to cutoff date and posted status
      const rows = transactions
        .filter((tx: any) => tx.status === 'posted' && tx.date >= cutoffISO)
        .map((tx: any) => {
          const rawAmount = parseFloat(tx.amount as string)
          const category  = (tx.details?.category ?? 'general') as string

          // For depository: spending is negative; for credit: spending is positive
          // We skip income/deposits — only import actual spending transactions
          const isSpend = acct.type === 'credit_card' ? rawAmount > 0 : rawAmount < 0
          if (!isSpend) return null

          return {
            user_id:               user.id,
            account_id:            acct.id,
            teller_transaction_id: tx.id as string,
            amount_cents:          Math.round(Math.abs(rawAmount) * 100),
            description:           (tx.details?.counterparty?.name ?? tx.description ?? '') as string,
            date:                  tx.date as string,
            bucket:                categorize(category),
            category_override:     false,
          }
        })
        .filter(Boolean) as object[]

      if (rows.length === 0) continue

      // Get IDs of existing rows with category_override = true (never re-categorize)
      const txIds = rows.map((r: any) => r.teller_transaction_id)
      const { data: existing } = await adminClient
        .from('transactions')
        .select('teller_transaction_id, category_override')
        .in('teller_transaction_id', txIds)
        .eq('user_id', user.id)

      const overrideIds = new Set(
        (existing ?? [])
          .filter((e: any) => e.category_override)
          .map((e: any) => e.teller_transaction_id)
      )

      const toUpsert = rows
        .map((r: any) => overrideIds.has(r.teller_transaction_id)
          ? { ...r, bucket: undefined }
          : r
        )

      const { error: upsertErr } = await adminClient
        .from('transactions')
        .upsert(toUpsert as object[], { onConflict: 'teller_transaction_id' })

      if (upsertErr) throw upsertErr
      imported += rows.length
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
