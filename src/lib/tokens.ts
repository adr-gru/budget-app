// JS-side design tokens for values that can't be expressed as Tailwind utility classes

export const CARD_GRADIENTS = {
  credit_card: { from: '#ef4444', to: '#dc2626' },
  checking:    { from: '#3b82f6', to: '#2563eb' },
  savings:     { from: '#16a34a', to: '#15803d' },
  investment:  { from: '#8b5cf6', to: '#7c3aed' }
} as const satisfies Record<string, { from: string; to: string }>

export type CardGradientKey = keyof typeof CARD_GRADIENTS
