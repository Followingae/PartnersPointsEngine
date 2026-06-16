/**
 * RFM Loyalty design-token preset (Tailwind v3).
 *
 * Design language (from the two inspirations):
 *  - Light mode primary, airy, generous whitespace.
 *  - Soft, large-radius cards with subtle shadows.
 *  - Accent gradients: coral→pink and teal→blue stat cards.
 *  - Punchy lime/chartreuse + near-black "ink" palette.
 *  - Big, tight "stat hero" numbers; left icon-rail nav; data-viz.
 *
 * Semantic (shadcn) colors read from CSS variables defined per app in globals.css;
 * the concrete brand palette is inlined here so it is identical across apps.
 *
 * @type {Partial<import('tailwindcss').Config>}
 */
const preset = {
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1440px' },
    },
    extend: {
      colors: {
        // ── shadcn/ui semantic tokens (HSL CSS vars set in each app's globals.css)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },

        // ── RFM brand palette (concrete) ──────────────────────────────────────
        ink: {
          DEFAULT: '#101012',
          soft: '#17171B',
          muted: '#2A2A30',
          50: '#F5F5F6',
          900: '#101012',
        },
        lime: {
          50: '#F8FCE8',
          100: '#EFF9C5',
          200: '#E4F49B',
          300: '#D8EE6E',
          400: '#CBE84A',
          500: '#B9DC2C',
          600: '#9BBE1E',
          700: '#769017',
          800: '#5A6F18',
          900: '#4A5A18',
        },
        coral: { DEFAULT: '#FF8A7A', soft: '#FFB199' },
        blush: { DEFAULT: '#FF6FA5', soft: '#FF9DC2' },
        teal: { DEFAULT: '#73E8D4', soft: '#A7F0E3' },
        sky: { DEFAULT: '#5BA8FB', soft: '#9CC9FD' },
      },
      borderRadius: {
        sm: 'calc(var(--radius) - 8px)',
        md: 'calc(var(--radius) - 4px)',
        lg: 'var(--radius)',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        '4xl': '2.5rem',
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgba(16,16,18,0.04), 0 12px 32px -12px rgba(16,16,18,0.12)',
        card: '0 1px 3px rgba(16,16,18,0.06), 0 8px 24px -16px rgba(16,16,18,0.10)',
        hero: '0 24px 64px -28px rgba(16,16,18,0.35)',
      },
      backgroundImage: {
        'gradient-coral': 'linear-gradient(135deg, #FFB199 0%, #FF6FA5 100%)',
        'gradient-teal': 'linear-gradient(135deg, #7EEAD4 0%, #5BA8FB 100%)',
        'gradient-lime': 'linear-gradient(135deg, #E6F89B 0%, #CBE84A 100%)',
        'gradient-ink': 'linear-gradient(135deg, #1F1F24 0%, #101012 100%)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'Inter', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        stat: ['3.25rem', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'stat-lg': ['4.5rem', { lineHeight: '0.95', letterSpacing: '-0.03em', fontWeight: '700' }],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

module.exports = preset;
