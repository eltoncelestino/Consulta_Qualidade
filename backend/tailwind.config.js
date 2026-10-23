module.exports = {
  content: ['./public/**/*.{html,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Arial', 'sans-serif']
      },
      colors: {
        sqm: {
          sidebar: '#0F172A',
          sidebarHover: '#1E293B',
          accent: '#2563EB',
          accentHover: '#1D4ED8',
          bg: '#F8FAFC',
          card: '#FFFFFF',
          border: '#E2E8F0'
        }
      }
    }
  },
  plugins: []
};
