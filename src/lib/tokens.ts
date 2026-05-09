// JS-side design tokens for values that can't be expressed as Tailwind utility classes
// (e.g. per-account-type gradient stops used in inline styles).

export const CARD_GRADIENTS = {
  credit_card: { from: '#ff6b6b', to: '#ee5a52' },
  checking:    { from: '#5b9bff', to: '#4a8af0' },
  savings:     { from: '#34c759', to: '#2ba84a' },
  investment:  { from: '#af52de', to: '#9b41cc' }
} as const satisfies Record<string, { from: string; to: string }>

export type CardGradientKey = keyof typeof CARD_GRADIENTS
