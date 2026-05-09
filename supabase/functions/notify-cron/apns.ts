const te = new TextEncoder()

function b64u(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const bin = atob(b64)
  return Uint8Array.from(bin, c => c.charCodeAt(0)).buffer
}

let cachedJwt: string | null = null
let cachedAt = 0

export async function getApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  // Reuse JWT for up to 55 minutes (APNs tokens expire at 60min)
  if (cachedJwt && now - cachedAt < 55 * 60) return cachedJwt

  const keyId   = Deno.env.get('APNS_KEY_ID')!
  const teamId  = Deno.env.get('APNS_TEAM_ID')!
  const pemKey  = Deno.env.get('APNS_KEY')!

  const header = b64u(te.encode(JSON.stringify({ alg: 'ES256', kid: keyId })))
  const claims = b64u(te.encode(JSON.stringify({ iss: teamId, iat: now })))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(pemKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    te.encode(`${header}.${claims}`)
  )

  cachedJwt = `${header}.${claims}.${b64u(sig)}`
  cachedAt = now
  return cachedJwt
}

export async function sendApns(token: string, payload: object): Promise<void> {
  const bundleId = Deno.env.get('APNS_BUNDLE_ID')!
  const jwt = await getApnsJwt()
  const res = await fetch(`https://api.push.apple.com/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`APNs error for token ${token.slice(-8)}: ${res.status} ${text}`)
  }
}
