import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { generateAuthenticationOptions } from 'npm:@simplewebauthn/server@13'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const origin = req.headers.get('origin') || ''
    const rpID = new URL(origin).hostname

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
    })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    await admin.from('passkey_challenges').insert({
      challenge: options.challenge,
      type: 'authentication',
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
