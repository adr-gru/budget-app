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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    // Optional: if plaid_item_db_id is provided, create an update-mode link token
    // so the user re-authenticates their existing connection instead of creating a new one.
    const body = await req.json().catch(() => ({})) as { plaid_item_db_id?: string }
    let access_token: string | undefined
    if (body.plaid_item_db_id) {
      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )
      const { data: item } = await adminClient
        .from('plaid_items')
        .select('plaid_access_token')
        .eq('id', body.plaid_item_db_id)
        .eq('user_id', user.id)
        .maybeSingle()
      access_token = (item as any)?.plaid_access_token ?? undefined
    }

    const plaidEnv = Deno.env.get('PLAID_ENV') ?? 'development'
    const linkPayload = access_token
      ? { user: { client_user_id: user.id }, client_name: 'Budget', access_token }
      : { user: { client_user_id: user.id }, client_name: 'Budget', products: ['transactions'], country_codes: ['US'], language: 'en' }

    const resp = await fetch(`https://${plaidEnv}.plaid.com/link/token/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID')!,
        'PLAID-SECRET': Deno.env.get('PLAID_SECRET')!,
      },
      body: JSON.stringify(linkPayload),
    })

    const data: any = await resp.json()
    if (data.error_code) return json({ error: data.error_message }, 400)

    return json({ link_token: data.link_token })
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
