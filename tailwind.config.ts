import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"]
      },
      colors: {
        brand: {
          primary: "#1b1f3b",
          accent: "#f25764"
        }
      }
    }
  },
  plugins: []
};

export default config;
