/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Nunito Sans"', 'sans-serif'],
        display: ['"Fredoka"', 'sans-serif']
      },
      colors: {
        brand: {
          red: '#E5383B',
          darkred: '#C42B2E',
          cream: '#FFF3E0',
          navy: '#1D3557',
          teal: '#2A9D8F',
          card: '#FFFFFF',
          ink: '#264653',
          muted: '#6B7280'
        }
      },
      boxShadow: {
        pos: '0 1px 0 #fff inset, 0 4px 0 rgba(30,41,59,0.15)',
        'pos-active': '0 1px 0 #fff inset, 0 1px 0 rgba(30,41,59,0.15)'
      }
    }
  },
  plugins: []
}
