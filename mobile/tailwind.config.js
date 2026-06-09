/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        teal: { 50: '#EFFEFE', 600: '#0E7C7B', 700: '#0A5E5D' },
        coral: { 500: '#F97066' },
        status: {
          normal: '#4ADE80',
          mild: '#FBBF24',
          moderate: '#FB923C',
          severe: '#F87171',
        },
      },
    },
  },
  plugins: [],
};
