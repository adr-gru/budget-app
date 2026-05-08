const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function formatMoney(cents: number): string {
  return fmt.format(cents / 100)
}

export function parseCents(value: string): number {
  const n = parseFloat(value.replace(/[^0-9.]/g, ''))
  if (isNaN(n)) return 0
  return Math.round(n * 100)
}

export function formatDollars(cents: number): string {
  return (cents / 100).toFixed(2)
}
