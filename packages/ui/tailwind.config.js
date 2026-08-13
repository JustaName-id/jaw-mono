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
      // Sizes are the spec's own px. They were briefly scaled by 400/350 to match the proportions
      // of the sheet's narrower card; that was wrong — the card is wider, not taller, so the extra
      // 50px buys room for long ENS names and addresses rather than asking for larger type. Only
      // the title keeps a raised value (26 over the spec's 24), by explicit request.
      //
      // Every role also fixes its own line-height. The spec annotates gaps between text and the box
      // around it, and an inherited line-height makes those gaps unreproducible — the same `pt-6`
      // lands differently depending on what the text sits inside. Weights are the designer's; the
      // line-heights are ours, chosen so the measured boxes come out right.
      fontSize: {
        // ── Annotated on the spec sheet's transaction frame ────────────────────────────────────
        'title-xl': ['26px', { lineHeight: '1.2', fontWeight: '700', letterSpacing: '-0.03em' }], // spec 24, raised by request
        heading: ['13px', { lineHeight: '1', fontWeight: '600', letterSpacing: '-0.02em' }], // "You send"
        button: ['13px', { lineHeight: '1', fontWeight: '600' }], // Cancel / Confirm
        value: ['12px', { lineHeight: '1.25', fontWeight: '500' }], // field value, asset amount
        body: ['12px', { lineHeight: '1.4', fontWeight: '400' }],
        'body-xs': ['10px', { lineHeight: '1.3', fontWeight: '400' }], // USD equivalent, chain name
        // Spec says 9; raised to 10 by request. Measuring the sheet's own "NETWORK FEE" also came
        // out at ~10, so the 9 may only ever have applied to the FROM/TO pair.
        label: ['10px', { lineHeight: '1', fontWeight: '600', letterSpacing: '0.13em' }], // mono caps label

        // ── Measured off the same frame, not annotated ─────────────────────────────────────────
        // Derived from ink height against the annotated roles (a 13px ascender measures 10.0 spec
        // px, 9px caps measure 6.7), so these carry roughly ±0.5px of measurement error.
        amount: ['16px', { lineHeight: '1.2', fontWeight: '600' }], // fee figure "$0.84"
        symbol: ['14px', { lineHeight: '1.2', fontWeight: '600' }], // asset symbol "USDC" — measured, ±1

        // ── Beyond the spec ───────────────────────────────────────────────────────────────────
        // Screens the sheet never framed. Kept in one block so they can be taken back to design
        // and either adopted or collapsed into the roles above.
        'body-sm': ['11px', { lineHeight: '1.4', fontWeight: '400' }],
        code: ['9px', { lineHeight: '1.4', fontWeight: '400' }], // mono, hashes and raw payload
        'amount-lg': ['26px', { lineHeight: '1.2', fontWeight: '700', letterSpacing: '-0.02em' }], // native-send hero
        title: ['20px', { fontWeight: '500', letterSpacing: '-0.02em' }], // card title, with header
        status: ['18px', { fontWeight: '500' }], // processing / success headline
        app: ['18px', { fontWeight: '600' }], // app name
        url: ['12px', { fontWeight: '500' }], // mono, under the app name
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
        token: '21px', // token logo — annotated "21 × 21" on the spec sheet
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
