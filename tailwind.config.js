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
        bg:      '#f5f5f7',
        surface: '#ffffff',
        elev:    '#fafafc',
        border:  '#e5e5ea',
        muted:   '#8e8e93',
        subtle:  '#6c6c70',
        text:    '#0a0a0c',
        accent:  '#007aff',
        danger:  '#ff3b30',
        success: '#34c759',
        warning: '#ff9500'
      },
      borderRadius: {
        DEFAULT: '10px',
        sm:  '8px',
        md:  '10px',
        lg:  '14px',
        xl:  '18px',
        '2xl': '24px'
      },
      boxShadow: {
        card:   '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
        raised: '0 4px 16px rgba(0,0,0,0.10)',
        sheet:  '0 -8px 32px rgba(0,0,0,0.10)'
      }
    }
  },
  plugins: []
}
