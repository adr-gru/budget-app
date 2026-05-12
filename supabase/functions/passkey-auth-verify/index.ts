import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { verifyAuthenticationResponse } from 'npm:@simplewebauthn/server@13'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function base64ToUint8(str: string): Uint8Array {
  const binary = atob(str)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return arr
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { authenticationResponse, challenge } = await req.json()

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: challengeRow } = await admin
      .from('passkey_challenges')
      .select('*')
      .eq('challenge', challenge)
      .eq('type', 'authentication')
      .gt('expires_at', new Date().toISOString())
      .single()

    if (!challengeRow) return json({ error: 'Invalid or expired challenge' }, 400)

    const { data: credential } = await admin
      .from('passkey_credentials')
      .select('*')
      .eq('credential_id', authenticationResponse.id)
      .single()

    if (!credential) return json({ error: 'Unknown credential' }, 400)

    const origin = req.headers.get('origin') || ''
    const rpID = new URL(origin).hostname

    const verification = await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credential.credential_id,
        publicKey: base64ToUint8(credential.public_key),
        counter: credential.counter,
        transports: credential.transports,
      },
      requireUserVerification: false,
    })

    if (!verification.verified) return json({ error: 'Verification failed' }, 400)

    await admin
      .from('passkey_credentials')
      .update({ counter: verification.authenticationInfo.newCounter })
      .eq('id', credential.id)

    await admin.from('passkey_challenges').delete().eq('id', challengeRow.id)

    const { data: { user } } = await admin.auth.admin.getUserById(credential.user_id)
    if (!user?.email) return json({ error: 'User not found' }, 400)

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      return json({ error: 'Failed to generate sign-in link' }, 500)
    }

    return json({ hashed_token: linkData.properties.hashed_token })
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
