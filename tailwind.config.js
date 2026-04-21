/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/client/index.html", "./src/client/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        shell: "0 1px 0 rgb(15 23 42 / 0.06)",
      },
    },
  },
  plugins: [],
};
