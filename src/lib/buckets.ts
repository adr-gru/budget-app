import type { Bucket, Profile } from './supabase'

export interface BucketMeta {
  label: string
  color: string
}

export const BUCKET_META: Record<Bucket, BucketMeta> = {
  needs:   { label: 'Needs',   color: '#3B82F6' },
  wants:   { label: 'Wants',   color: '#8B5CF6' },
  savings: { label: 'Savings', color: '#16A34A' }
}

export const BUCKETS: Bucket[] = ['needs', 'wants', 'savings']

export function bucketTargetCents(profile: Profile, bucket: Bucket): number {
  const pct = bucket === 'needs' ? profile.needs_pct
            : bucket === 'wants' ? profile.wants_pct
            : profile.savings_pct
  return Math.round(profile.paycheck_cents * pct / 100)
}

export function bucketPct(profile: Profile, bucket: Bucket): number {
  return bucket === 'needs' ? profile.needs_pct
       : bucket === 'wants' ? profile.wants_pct
       : profile.savings_pct
}
