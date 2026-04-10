/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // MidSwap brand colors
        'midnight': {
          DEFAULT: '#0D0E12',
          50: '#2C2F36',
          100: '#25282E',
          200: '#1E2126',
          300: '#17191E',
          400: '#101216',
          500: '#0D0E12',
          600: '#0A0B0E',
          700: '#07080A',
          800: '#040506',
          900: '#010102',
        },
        'accent': {
          primary: '#6366F1',    // Indigo
          secondary: '#8B5CF6',  // Purple
          success: '#22C55E',    // Green
          warning: '#F59E0B',    // Amber
          error: '#EF4444',      // Red
        },
        'surface': {
          DEFAULT: '#191B1F',
          light: '#212429',
          lighter: '#2C2F36',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px #6366F1, 0 0 10px #6366F1' },
          '100%': { boxShadow: '0 0 20px #6366F1, 0 0 30px #6366F1' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh': 'url("/mesh-gradient.svg")',
      },
    },
  },
  plugins: [],
};
