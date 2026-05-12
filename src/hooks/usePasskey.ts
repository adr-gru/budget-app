import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export const passkeySupported =
  typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined'

function getDeviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Macintosh/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows PC'
  if (/Android/i.test(ua)) return 'Android'
  return 'Browser'
}

async function throwFnError(err: unknown): Promise<never> {
  let msg = (err as { message?: string }).message ?? 'Request failed'
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await (err as any).context?.json?.()
    if (body?.error) msg = body.error
  } catch { /* ignore */ }
  throw new Error(msg)
}

export function usePasskey() {
  const qc = useQueryClient()

  async function register() {
    const { data: options, error: optErr } = await supabase.functions.invoke(
      'passkey-register-options',
      { body: {} }
    )
    if (optErr) await throwFnError(optErr)
    if (options?.error) throw new Error(options.error)

    const registrationResponse = await startRegistration(options)

    const { data: result, error: verErr } = await supabase.functions.invoke(
      'passkey-register-verify',
      { body: { registrationResponse, deviceName: getDeviceName() } }
    )
    if (verErr) await throwFnError(verErr)
    if (result?.error) throw new Error(result.error)

    qc.invalidateQueries({ queryKey: ['passkeys'] })
  }

  async function authenticate(): Promise<void> {
    const { data: options, error: optErr } = await supabase.functions.invoke(
      'passkey-auth-options',
      { body: {} }
    )
    if (optErr) await throwFnError(optErr)
    if (options?.error) throw new Error(options.error)

    const authResponse = await startAuthentication(options)

    const { data: result, error: verErr } = await supabase.functions.invoke(
      'passkey-auth-verify',
      { body: { authenticationResponse: authResponse, challenge: options.challenge } }
    )
    if (verErr) await throwFnError(verErr)
    if (result?.error) throw new Error(result.error)

    const { error: sessionError } = await supabase.auth.verifyOtp({
      token_hash: result.hashed_token,
      type: 'magiclink',
    })
    if (sessionError) throw sessionError

    window.location.href = '/'
  }

  return { register, authenticate }
}
