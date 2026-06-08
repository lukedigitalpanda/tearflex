import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        teal: { 50: '#EFFEFE', 600: '#0E7C7B', 700: '#0A5E5D' },
        slate: { 50: '#F8FAFC', 300: '#CBD5E1', 600: '#475569', 900: '#0F172A' },
        status: {
          normal: '#4ADE80', mild: '#FBBF24', moderate: '#FB923C', severe: '#F87171',
        },
        coral: { 500: '#F97066' },
      },
      fontFamily: { sans: ['var(--font-inter)', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
