import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          black: '#000000',
          red: '#FF0000',
          green: '#008000'
        }
      }
    }
  },
  plugins: []
};

export default config;
