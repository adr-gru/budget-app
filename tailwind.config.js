/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '390px'
      },
      fontFamily: {
        sans:    ['Roboto', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'ui-sans-serif', 'sans-serif'],
        mono:    ['Inconsolata', 'ui-monospace', 'monospace']
      },
      colors: {
        bg:        '#F9FAFB',
        surface:   '#FFFFFF',
        elev:      '#F3F4F6',
        border:    '#E5E7EB',
        muted:     '#6B7280',
        subtle:    '#374151',
        text:      '#111827',
        accent:    '#3B82F6',
        primary:   '#3B82F6',
        secondary: '#8B5CF6',
        danger:    '#DC2626',
        success:   '#16A34A',
        warning:   '#D97706'
      },
      borderRadius: {
        DEFAULT: '8px',
        sm:  '4px',
        md:  '8px',
        lg:  '12px',
        xl:  '16px',
        '2xl': '24px'
      },
      boxShadow: {
        card:   '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        raised: '0 4px 12px rgba(0,0,0,0.08)',
        sheet:  '0 -4px 24px rgba(0,0,0,0.08)',
        modal:  '0 20px 60px rgba(0,0,0,0.15)'
      }
    }
  },
  plugins: []
}
