import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        field: "rgb(var(--color-field) / <alpha-value>)",
        board: "rgb(var(--color-board) / <alpha-value>)",
        wire: "rgb(var(--color-wire) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        primary: "rgb(var(--color-primary) / <alpha-value>)"
      },
      boxShadow: {
        soft: "0 12px 32px rgb(var(--color-primary) / 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
