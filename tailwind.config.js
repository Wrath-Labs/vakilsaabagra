/** @type {import('tailwindcss').Config} */
module.exports = {
  // Light theme only — dark mode is deliberately not enabled.
  content: ['./*.html', './js/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', '"Times New Roman"', 'serif'],
      },
      colors: {
        ink: { DEFAULT: '#0f2540', 2: '#1b3f68', 3: '#081527' },
        gold: { DEFAULT: '#b0861f', 2: '#dcb85f', 3: '#f7e3a1' },
        paper: { DEFAULT: '#ffffff', 2: '#faf8f4', 3: '#f4f1ea' },
      },
      maxWidth: { '8xl': '88rem' },
    },
  },
  plugins: [],
};
