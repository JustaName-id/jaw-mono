/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Disable preflight to prevent global CSS resets in consuming apps
  corePlugins: {
    preflight: false,
  },
  // Safelist ensures all Tailwind classes used by components are included
  safelist: [
    // Color variants for all semantic colors
    {
      pattern: /^(bg|text|border|ring)-(background|foreground|card|popover|primary|secondary|muted|accent|destructive|input|border|ring)/,
      variants: ['hover', 'focus', 'active', 'dark'],
    },
    // Common utilities used in dialogs
    {
      pattern: /^(rounded|shadow|opacity|z)-/,
      variants: ['hover', 'focus'],
    },
    // Layout and positioning
    {
      pattern: /^(fixed|absolute|relative|inset|top|bottom|left|right)-/,
    },
    // Spacing
    {
      pattern: /^(p|m|gap|space)-(0|1|2|3|4|5|6|8|10|12|16|20|24)/,
    },
    // Flexbox and Grid
    {
      pattern: /^(flex|grid|items|justify|content)-.*/,
      variants: ['sm', 'md', 'lg', 'xl', '2xl'],
    },
    // Animation classes from tailwindcss-animate
    'animate-in',
    'animate-out',
    'fade-in-0',
    'fade-out-0',
    'zoom-in-95',
    'zoom-out-95',
    'slide-in-from-left-1/2',
    'slide-in-from-top-1/2',
    'slide-out-to-left-1/2',
    'slide-out-to-top-1/2',
    // Common z-index values
    'z-50',
    'z-40',
    'z-10',
    // Radix UI data attributes
    '[&[data-state=open]]',
    '[&[data-state=closed]]',
  ],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'var(--background)',
  			foreground: 'var(--foreground)',
  			card: {
  				DEFAULT: 'var(--card)',
  				foreground: 'var(--card-foreground)'
  			},
  			popover: {
  				DEFAULT: 'var(--popover)',
  				foreground: 'var(--popover-foreground)'
  			},
  			primary: {
  				DEFAULT: 'var(--primary)',
  				foreground: 'var(--primary-foreground)'
  			},
  			secondary: {
  				DEFAULT: 'var(--secondary)',
  				foreground: 'var(--secondary-foreground)'
  			},
  			muted: {
  				DEFAULT: 'var(--muted)',
  				foreground: 'var(--muted-foreground)'
  			},
  			accent: {
  				DEFAULT: 'var(--accent)',
  				foreground: 'var(--accent-foreground)'
  			},
  			destructive: {
  				DEFAULT: 'var(--destructive)',
  				foreground: 'var(--destructive-foreground)'
  			},
  			border: 'var(--border)',
  			input: 'var(--input)',
  			ring: 'var(--ring)',
  			chart: {
  				'1': 'var(--chart-1)',
  				'2': 'var(--chart-2)',
  				'3': 'var(--chart-3)',
  				'4': 'var(--chart-4)',
  				'5': 'var(--chart-5)'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}

