/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'custom': '#20B2AA',
        'custom-hover': '#1A9D94',
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};