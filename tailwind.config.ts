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
        ink: "#17202a",
        field: "#f4f7fb",
        board: "#0f766e",
        wire: "#d7dee8",
        accent: "#c2410c"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(23, 32, 42, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
