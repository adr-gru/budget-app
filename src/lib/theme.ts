export type Theme = 'system' | 'light' | 'dark'
const KEY = 'app-theme'
export function getTheme(): Theme { return (localStorage.getItem(KEY) as Theme) ?? 'system' }
export function setTheme(t: Theme) { localStorage.setItem(KEY, t); applyTheme(t) }
export function applyTheme(t: Theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = t === 'dark' || (t === 'system' && prefersDark)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}
