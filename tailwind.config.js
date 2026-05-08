/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      colors: {
        bg: '#18181b',
        surface: '#1f1f23',
        elev: '#27272a',
        border: '#2e2e33',
        muted: '#71717a',
        subtle: '#a1a1aa',
        text: '#fafafa',
        accent: '#a78bfa',
        danger: '#f43f5e',
        success: '#34d399'
      },
      borderRadius: {
        DEFAULT: '8px',
        sm: '6px',
        md: '8px',
        lg: '10px'
      }
    }
  },
  plugins: []
}
