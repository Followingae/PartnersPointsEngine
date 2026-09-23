import type { Config } from 'tailwindcss';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preset = require('@rfm-loyalty/config/tailwind-preset');

const config: Config = {
  presets: [preset],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // The Partners Points logo blue. The consoles lean lime; the developer
        // portal leans on the mark itself so partners see the brand they were sold.
        brand: {
          DEFAULT: '#0B04D9',
          50: '#EEEDFF',
          100: '#DCDAFF',
          200: '#B9B5FF',
          600: '#0B04D9',
          700: '#0903AE',
          900: '#05025C',
        },
      },
    },
  },
};

export default config;
