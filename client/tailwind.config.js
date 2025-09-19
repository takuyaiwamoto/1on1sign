/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#0D47A1',
          accent: '#FFC107'
        }
      }
    }
  },
  plugins: []
};
