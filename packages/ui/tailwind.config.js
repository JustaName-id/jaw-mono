/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  // Every utility is emitted as `[data-jaw-ui] .foo`, so the SDK's styles cannot leak into a host
  // page and a host's identically-named utility cannot win inside our subtree. Everything the SDK
  // renders lives under one element carrying this attribute (portals included, via
  // PortalContainerContext), so nothing escapes the scope.
  important: '[data-jaw-ui]',
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  // Disable preflight to prevent global CSS resets in consuming apps
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      // Inter carries the interface. JetBrains Mono carries anything a user might verify —
      // addresses, amounts, hashes, labels. Nothing renders below 9px.
      fontSize: {
        'title-xl': ['24px', { fontWeight: '700', letterSpacing: '-0.03em' }], // headerless card title
        title: ['20px', { fontWeight: '500', letterSpacing: '-0.02em' }], // card title, with header
        status: ['18px', { fontWeight: '500' }],
        app: ['18px', { fontWeight: '600' }], // app name
        body: ['12px', { fontWeight: '400' }],
        'body-sm': ['11px', { fontWeight: '400' }],
        'body-xs': ['10px', { fontWeight: '400' }],
        button: ['11px', { fontWeight: '600' }],
        url: ['12px', { fontWeight: '500' }], // mono, under the app name
        value: ['10px', { fontWeight: '500' }], // mono, field values
        label: ['9px', { fontWeight: '600', letterSpacing: '0.13em' }], // mono, caps field labels
        code: ['9px', { fontWeight: '400' }], // mono, hashes and raw payload

        // ── Beyond the spec ───────────────────────────────────────────────────────────────────
        // The spec measures four frames and names twelve roles; these screens have component kinds
        // it never covered — in-card section headers and figures. Every size below is on the spec's
        // grid (9/10/11/12/18/20/24); only the weight pairing is new. Kept in one block so they can
        // be taken back to design and either adopted or collapsed into the roles above.
        heading: ['12px', { fontWeight: '600', letterSpacing: '-0.02em' }], // "You send", "Allowed calls"
        amount: ['12px', { fontWeight: '600' }], // fee and asset figures
        'amount-lg': ['24px', { fontWeight: '700', letterSpacing: '-0.02em' }], // native-send hero
      },

      // Radii: 99 · 16.5 · 12 · 8 · 4. Nothing else is legal.
      borderRadius: {
        card: '16.5px',
        box: '12px',
        chip: '8px',
        xs: '4px',
        pill: '99px',
        // Pre-existing shadcn aliases — `rounded-lg/md/sm` are used by buttons, tooltip and
        // checkbox, and resolve to the radius CSS variable rather than a spec value.
        lg: 'var(--jaw-radius)',
        md: 'calc(var(--jaw-radius) - 2px)',
        sm: 'calc(var(--jaw-radius) - 4px)',
      },

      // Object sizes the spec fixes by name. The 4/8/12/16/20/24 spacing scale is Tailwind's own
      // 1/2/3/4/5/6, so spacing needs no tokens — only the habit of not writing px.
      size: {
        badge: '16px', // chain badge
        token: '20px', // token logo
        blob: '13.5px', // account blob, inline
        'blob-lg': '34px',
        logo: '48px', // app logo circle
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        background: 'oklch(var(--jaw-color-background) / <alpha-value>)',
        foreground: 'oklch(var(--jaw-color-foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'oklch(var(--jaw-color-card) / <alpha-value>)',
          foreground: 'oklch(var(--jaw-color-card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'oklch(var(--jaw-color-popover) / <alpha-value>)',
          foreground: 'oklch(var(--jaw-color-popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'oklch(var(--jaw-color-primary) / <alpha-value>)',
          foreground: 'oklch(var(--jaw-color-primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'oklch(var(--jaw-color-secondary) / <alpha-value>)',
          foreground: 'oklch(var(--jaw-color-secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'oklch(var(--jaw-color-muted) / <alpha-value>)',
          foreground: 'oklch(var(--jaw-color-muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'oklch(var(--jaw-color-accent) / <alpha-value>)',
          foreground: 'oklch(var(--jaw-color-accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'oklch(var(--jaw-color-destructive) / <alpha-value>)',
          foreground: 'oklch(var(--jaw-color-destructive-foreground) / <alpha-value>)',
          // `hover:bg-destructive-hover` on the revoke button. Without this key the class emitted
          // no CSS — it only ever worked because a host app compiled our source with its own theme.
          hover: 'oklch(var(--jaw-color-destructive-hover) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'oklch(var(--jaw-color-success) / <alpha-value>)',
          foreground: 'oklch(var(--jaw-color-success-foreground) / <alpha-value>)',
        },
        border: 'oklch(var(--jaw-color-border) / <alpha-value>)',
        input: 'oklch(var(--jaw-color-input) / <alpha-value>)',
        ring: 'oklch(var(--jaw-color-ring) / <alpha-value>)',
        chart: {
          1: 'oklch(var(--jaw-color-chart-1) / <alpha-value>)',
          2: 'oklch(var(--jaw-color-chart-2) / <alpha-value>)',
          3: 'oklch(var(--jaw-color-chart-3) / <alpha-value>)',
          4: 'oklch(var(--jaw-color-chart-4) / <alpha-value>)',
          5: 'oklch(var(--jaw-color-chart-5) / <alpha-value>)',
        },
      },
      keyframes: {
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
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
