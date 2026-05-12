// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { generateRegistrationOptions } from 'npm:@simplewebauthn/server@10'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authError } = await anon.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: existing } = await admin
      .from('passkey_credentials')
      .select('credential_id, transports')
      .eq('user_id', user.id)

    const origin = req.headers.get('origin') || ''
    const rpID = new URL(origin).hostname

    const options = await generateRegistrationOptions({
      rpName: 'Budget',
      rpID,
      userID: new TextEncoder().encode(user.id),
      userName: user.email!,
      userDisplayName: user.email!,
      attestationType: 'none',
      excludeCredentials: (existing ?? []).map((c: any) => ({
        id: c.credential_id,
        transports: c.transports ?? [],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    })

    await admin.from('passkey_challenges').insert({
      user_id: user.id,
      challenge: options.challenge,
      type: 'registration',
    })

    return json(options)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
