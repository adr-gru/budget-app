// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { plaid_item_db_id } = await req.json() as { plaid_item_db_id: string }

    // Fetch plaid_item — verify ownership by checking user_id
    const { data: plaidItem, error: itemErr } = await adminClient
      .from('plaid_items')
      .select('plaid_access_token, institution_name, user_id')
      .eq('id', plaid_item_db_id)
      .single()

    if (itemErr || !plaidItem) return json({ error: 'Not found' }, 404)
    if (plaidItem.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

    const plaidEnv = Deno.env.get('PLAID_ENV') ?? 'sandbox'

    // Fetch all accounts for this item from Plaid
    const plaidResp = await fetch(`https://${plaidEnv}.plaid.com/accounts/get`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID')!,
        'PLAID-SECRET': Deno.env.get('PLAID_SECRET')!,
      },
      body: JSON.stringify({ access_token: plaidItem.plaid_access_token }),
    })

    const plaidData: any = await plaidResp.json()
    if (plaidData.error_code) return json({ error: plaidData.error_message }, 400)

    // Find all plaid_account_ids already claimed by any account row for this item
    // (regardless of archived state — treat archived as still claimed)
    const { data: existingAccounts } = await adminClient
      .from('accounts')
      .select('plaid_account_id')
      .eq('plaid_item_id', plaid_item_db_id)
      .eq('user_id', user.id)

    const claimedIds = new Set((existingAccounts ?? []).map((a: any) => a.plaid_account_id))

    // Map Plaid response to PlaidLinkAccount shape, filtering out already-claimed accounts
    const accounts = (plaidData.accounts ?? [])
      .filter((a: any) => !claimedIds.has(a.account_id))
      .map((a: any) => ({
        id:                  a.account_id,
        name:                a.name,
        mask:                a.mask ?? null,
        type:                a.type,
        subtype:             a.subtype ?? '',
        verification_status: null,
      }))

    return json({ institution_name: plaidItem.institution_name ?? null, accounts })
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
