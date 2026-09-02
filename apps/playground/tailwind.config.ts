import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // Enable preflight for CSS resets (removes default margins, etc.)
  corePlugins: {
    preflight: true,
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        chart: {
          '1': 'var(--chart-1)',
          '2': 'var(--chart-2)',
          '3': 'var(--chart-3)',
          '4': 'var(--chart-4)',
          '5': 'var(--chart-5)',
        },
        // Playground v2 shell palette (see globals.css for the two modes).
        shell: {
          canvas: 'var(--shell-canvas)',
          panel: 'var(--shell-panel)',
          pop: 'var(--shell-pop)',
          code: 'var(--shell-code)',
          'code-ink': 'var(--shell-code-ink)',
          ink: 'var(--shell-ink)',
          'ink-2': 'var(--shell-ink-2)',
          'ink-3': 'var(--shell-ink-3)',
          'ink-4': 'var(--shell-ink-4)',
          line: 'var(--shell-line)',
          'line-2': 'var(--shell-line-2)',
          raise: 'var(--shell-raise)',
          'raise-2': 'var(--shell-raise-2)',
          active: 'var(--shell-active)',
          btn: 'var(--shell-btn)',
          'btn-ink': 'var(--shell-btn-ink)',
          ok: 'var(--shell-ok)',
          'ok-ink': 'var(--shell-ok-ink)',
          warn: 'var(--shell-warn)',
          err: 'var(--shell-err)',
          'core-ink': 'var(--shell-core-ink)',
          'core-bg': 'var(--shell-core-bg)',
          'wagmi-ink': 'var(--shell-wagmi-ink)',
          'wagmi-bg': 'var(--shell-wagmi-bg)',
        },
      },
      keyframes: {
        'pulse-dot': {
          '0%': { boxShadow: '0 0 0 0 rgba(5,150,105,.5)' },
          '70%': { boxShadow: '0 0 0 7px rgba(5,150,105,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(5,150,105,0)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 2s ease-out infinite',
        'fade-up': 'fade-up 0.18s cubic-bezier(0.2, 0.7, 0.2, 1)',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
