/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        'xs': '375px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
        'tv': '1920px',
      },
      colors: {
        camp: {
          green: '#22c55e',
          'green-hover': '#16a34a',
          'green-light': '#86efac',
          'green-dark': '#14532d',
        },
        dark: {
          bg: '#0f172a',
          'bg-secondary': '#1e293b',
          'bg-card': '#1f2937',
          text: '#f9fafb',
          'text-secondary': '#9ca3af',
          border: '#374151',
          'border-light': '#4b5563',
        },
        light: {
          bg: '#ffffff',
          'bg-secondary': '#f1f5f9',
          'bg-card': '#f8fafc',
          text: '#1f2937',
          'text-secondary': '#6b7280',
          border: '#e5e7eb',
          'border-light': '#d1d5db',
        },
      },
      fontSize: {
        'tv-sm': 'clamp(1rem, 2vw, 1.25rem)',
        'tv-base': 'clamp(1.125rem, 2.5vw, 1.5rem)',
        'tv-lg': 'clamp(1.25rem, 3vw, 2rem)',
        'tv-xl': 'clamp(1.5rem, 4vw, 2.5rem)',
        'tv-2xl': 'clamp(2rem, 6vw, 3.75rem)',
        'tv-3xl': 'clamp(2.5rem, 8vw, 5rem)',
      },
    },
  },
  plugins: [],
}