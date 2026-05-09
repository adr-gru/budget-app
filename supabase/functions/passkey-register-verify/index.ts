import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { verifyRegistrationResponse } from 'npm:@simplewebauthn/server@9'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function uint8ToBase64(arr: Uint8Array): string {
  let binary = ''
  for (const byte of arr) binary += String.fromCharCode(byte)
  return btoa(binary)
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

    const { registrationResponse, deviceName } = await req.json()

    const { data: challengeRow } = await admin
      .from('passkey_challenges')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', 'registration')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!challengeRow) return json({ error: 'No pending challenge' }, 400)

    const origin = req.headers.get('origin') || ''
    const rpID = new URL(origin).hostname

    const verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    })

    if (!verification.verified || !verification.registrationInfo) {
      return json({ error: 'Verification failed' }, 400)
    }

    const { credential, aaguid } = verification.registrationInfo

    await admin.from('passkey_credentials').insert({
      user_id: user.id,
      credential_id: credential.id,
      public_key: uint8ToBase64(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      device_name: deviceName ?? null,
      aaguid: aaguid ?? null,
    })

    await admin.from('passkey_challenges').delete().eq('id', challengeRow.id)

    return json({ success: true })
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
