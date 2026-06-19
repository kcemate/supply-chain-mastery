import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        accent: 'var(--color-accent)',
        'accent-soft': 'var(--color-accent-soft)',
        canvas: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-subtle': 'var(--color-surface-subtle)',
        ink: 'var(--color-ink)',
        'ink-muted': 'var(--color-ink-muted)',
        'ink-soft': 'var(--color-ink-soft)',
        line: 'var(--color-line)',
        'line-soft': 'var(--color-line-soft)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'Segoe UI',
          'sans-serif',
        ],
        display: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'Segoe UI',
          'sans-serif',
        ],
      },
      borderRadius: {
        tokenSm: 'var(--radius-sm)',
        tokenMd: 'var(--radius-md)',
        tokenLg: 'var(--radius-lg)',
        tokenXl: 'var(--radius-xl)',
      },
      boxShadow: {
        soft: 'var(--elevation-soft)',
      },
      spacing: {
        token1: 'var(--space-1)',
        token2: 'var(--space-2)',
        token3: 'var(--space-3)',
        token4: 'var(--space-4)',
        token5: 'var(--space-5)',
        token6: 'var(--space-6)',
        token7: 'var(--space-7)',
        token8: 'var(--space-8)',
      },
    },
  },
  plugins: [],
};

export default config;
