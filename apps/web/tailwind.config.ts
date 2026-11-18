import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Hot-rod control panel palette: candy-apple red, chrome, flame yellow.
        rod: {
          50: '#fff1f1',
          300: '#f87178',
          500: '#d7141a',
          600: '#b31217',
          700: '#8f0e13',
          800: '#6b0a0e',
          900: '#3b0608',
          950: '#1f0304',
        },
        chrome: {
          200: '#e5e9ef',
          400: '#c9ced6',
          600: '#8a919c',
        },
        flame: {
          400: '#ffd83d',
          500: '#ffc400',
          600: '#e6a800',
        },
      },
    },
  },
  plugins: [],
};

export default config;
