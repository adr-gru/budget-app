import { Bucket } from '../lib/supabase'
import { BUCKET_META } from '../lib/buckets'
import { formatMoney } from '../lib/money'

interface Props {
  bucket: Bucket
  pct: number
  targetCents: number
  actualCents: number
}

export function BucketCard({ bucket, pct, targetCents, actualCents }: Props) {
  const meta = BUCKET_META[bucket]
  const ratio = targetCents > 0 ? Math.min(actualCents / targetCents, 1) : 0
  const over = actualCents > targetCents && targetCents > 0
  const remaining = targetCents - actualCents

  return (
    <div className="card px-4 py-3.5">
      <div className="flex items-baseline justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: meta.color }}
          />
          <span className="text-sm font-medium text-text">{meta.label}</span>
          <span className="text-xs text-muted">{pct}%</span>
        </div>
        <div className="text-right">
          <span className="font-mono text-sm tabular-nums font-semibold text-text">
            {formatMoney(actualCents)}
          </span>
          <span className="font-mono text-xs text-muted tabular-nums">
            {' '}/{' '}{formatMoney(targetCents)}
          </span>
        </div>
      </div>
      <div className="h-1.5 bg-elev rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${ratio * 100}%`,
            background: over ? '#DC2626' : meta.color
          }}
        />
      </div>
      {over ? (
        <p className="text-xs text-danger mt-1.5 font-mono tabular-nums">
          {formatMoney(actualCents - targetCents)} over budget
        </p>
      ) : targetCents > 0 ? (
        <p className="text-xs text-muted mt-1.5 font-mono tabular-nums">
          {formatMoney(remaining)} remaining
        </p>
      ) : null}
    </div>
  )
}
