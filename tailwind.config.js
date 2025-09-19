/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cor primária (mantida a original)
        'custom': '#20B2AA',
        'custom-hover': '#1A9D94',
        
        // Cores secundárias
        'secondary': {
          50: '#f0f9f9',
          100: '#d9f2f1',
          200: '#b3e5e2',
          300: '#8cd8d3',
          400: '#66cbc4',
          500: '#40beb5',
          600: '#339891',
          700: '#26726d',
          800: '#1a4c48',
          900: '#0d2624',
        },
        
        // Cores terciárias
        'accent': {
          50: '#f5f9ff',
          100: '#e5f0ff',
          200: '#cce0ff',
          300: '#99c2ff',
          400: '#66a3ff',
          500: '#3385ff',
          600: '#0066ff',
          700: '#0052cc',
          800: '#003d99',
          900: '#002966',
        },
        'neutral': {
          50: '#f8f9fa',
          100: '#e9ecef',
          200: '#dee2e6',
          300: '#ced4da',
          400: '#adb5bd',
          500: '#6c757d',
          600: '#495057',
          700: '#343a40',
          800: '#212529',
          900: '#121416',
        },
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};