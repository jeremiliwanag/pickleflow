/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#16a34a",
        primaryDark: "#15803d",
        surface: "#f0fdf4",
      },
    },
  },
  plugins: [],
};