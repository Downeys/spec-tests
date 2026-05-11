import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bp-bg': '#18181b',
        'bp-surface': '#27272a',
        'bp-text': '#e4e4e7',
        'bp-muted': '#a1a1aa',
        'bp-border': '#3f3f46',
        'bp-accent': '#60a5fa',
        'bp-skeptic': '#fb923c',
        'bp-source': '#22d3ee',
        'bp-tool': '#71717a',
      },
      fontSize: {
        'page-title': ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        'section-header': ['16px', { lineHeight: '1.3', fontWeight: '600' }],
        body: ['15px', { lineHeight: '1.5', fontWeight: '400' }],
        'tool-call': ['13px', { lineHeight: '1.4', fontWeight: '400' }],
        badge: ['12px', { lineHeight: '1.3', fontWeight: '500' }],
        status: ['12px', { lineHeight: '1.3', fontWeight: '400' }],
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"Fira Code"', '"Cascadia Code"', '"JetBrains Mono"', 'Consolas', 'monospace'],
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  plugins: [require('tailwindcss-animate')],
};

export default config;
