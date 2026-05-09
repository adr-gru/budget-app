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

    // Validate user JWT
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    // Use service role to write plaid_items (access tokens must stay server-side)
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { public_token, institution_name } = await req.json() as {
      public_token: string
      institution_name: string | null
    }

    const plaidEnv = Deno.env.get('PLAID_ENV') ?? 'development'

    // Exchange public_token for access_token
    const exchangeResp = await fetch(`https://${plaidEnv}.plaid.com/item/public_token/exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID')!,
        'PLAID-SECRET': Deno.env.get('PLAID_SECRET')!,
      },
      body: JSON.stringify({ public_token }),
    })

    const exchangeData: any = await exchangeResp.json()
    if (exchangeData.error_code) {
      return json({ error: exchangeData.error_message }, 400)
    }

    const { access_token, item_id } = exchangeData as {
      access_token: string
      item_id: string
    }

    // Upsert plaid_items row — access_token never leaves this function
    const { data: plaidItem, error: dbError } = await adminClient
      .from('plaid_items')
      .upsert(
        {
          user_id: user.id,
          plaid_item_id: item_id,
          plaid_access_token: access_token,
          institution_name: institution_name ?? null,
        },
        { onConflict: 'user_id,plaid_item_id' }
      )
      .select('id')
      .single()

    if (dbError) throw dbError

    return json({ plaid_item_db_id: plaidItem.id })
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
