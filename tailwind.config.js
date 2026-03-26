/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'selector',
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3880ff',
        secondary: '#3dc2ff',
        success: '#2dd36f',
        warning: '#ffc409',
        danger: '#eb445a',
        dark: '#222428',
        medium: '#92949c',
        light: '#f4f5f8',
        red1: '#ca1f7b',
        red2: '#fd312e',
        cyan1: '#7bfb51',
        cyan2: '#ca1f7b',
        background: 'rgba(125, 138, 0, 1)',
      },
      gridTemplateColumns: {
        '16': 'repeat(16, minmax(0, 1fr))',
      }
    },
  },
  plugins: [],
}

