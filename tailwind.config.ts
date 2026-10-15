import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { 50: '#f1f0ff', 100: '#e6e4ff', 200: '#d0ccff', 300: '#b0a8fc', 400: '#8b7ff7', 500: '#6c5cf0', 600: '#5a45e6', 700: '#4b37cc', 800: '#3e2fa5', 900: '#2b2272' },
        lav: { 50: '#f7f7fd', 100: '#eef0fb', 200: '#e3e6f6' },
        ink: '#151a33',
      },
      boxShadow: { card: '0 1px 2px rgba(20,20,60,.04), 0 4px 16px rgba(60,50,160,.06)' },
    },
  },
  plugins: [],
} satisfies Config;
