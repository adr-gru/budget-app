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

    // Fetch plaid_item — verify ownership
    const { data: plaidItem, error: itemErr } = await adminClient
      .from('plaid_items')
      .select('plaid_access_token, user_id')
      .eq('id', plaid_item_db_id)
      .single()

    if (itemErr || !plaidItem) return json({ error: 'Not found' }, 404)
    if (plaidItem.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

    const plaidEnv = Deno.env.get('PLAID_ENV') ?? 'sandbox'

    // Call Plaid /item/remove to release the connection slot from the trial count
    await fetch(`https://${plaidEnv}.plaid.com/item/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID')!,
        'PLAID-SECRET': Deno.env.get('PLAID_SECRET')!,
      },
      body: JSON.stringify({ access_token: plaidItem.plaid_access_token }),
    })
    // Even if Plaid returns an error (e.g. item already removed), proceed with DB cleanup

    // Delete plaid_items row — FK ON DELETE SET NULL auto-nulls accounts.plaid_item_id,
    // which degrades previously-linked accounts to manual mode
    const { error: deleteErr } = await adminClient
      .from('plaid_items')
      .delete()
      .eq('id', plaid_item_db_id)

    if (deleteErr) throw deleteErr

    return json({ ok: true })
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
