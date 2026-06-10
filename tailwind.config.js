
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './views/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './data/**/*.{ts,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'vira-primary': '#3674B5',
        'vira-secondary': '#578FCA',
        'vira-accent': '#A1E3F9',
        'vira-light': '#D1F8EF',
        'vira-dark': '#1e3a8a' // Darker blue for contrast
      },
      fontFamily: {
        // Vazirmatn is now first priority
        sans: ['Vazirmatn', 'Tahoma', 'Segoe UI', 'sans-serif']
      }
    }
  },
  plugins: []
};
