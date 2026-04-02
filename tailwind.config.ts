import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      colors: {
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "bg-elevated": "var(--bg-elevated)",
        "bg-card": "var(--bg-card)",
      },
      borderRadius: {
        card: "var(--radius)",
        input: "var(--radius-sm)",
      },
      boxShadow: {
        glow: "var(--shadow-glow)",
      },
    },
  },
  plugins: [],
};
export default config;
