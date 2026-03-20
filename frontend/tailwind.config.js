/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // WHOOP — dark bg, red accents
        whoop: { bg: '#0d0d0d', accent: '#e63535', text: '#f0f0f0' },
        // Oura — dark navy, gold accents
        oura: { bg: '#0b1628', accent: '#c9a84c', text: '#e8eaf0' },
        // Pison — brand teal/dark
        pison: { bg: '#0f1923', accent: '#00d4b4', text: '#ffffff' },
        // Neurable — brand purple/dark
        neurable: { bg: '#0e0e1a', accent: '#7c4dff', text: '#f4f4ff' },
      },
    },
  },
  plugins: [],
}
