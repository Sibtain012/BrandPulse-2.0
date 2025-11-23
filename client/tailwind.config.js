/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // BrandPulse Light Analytics Theme
                brand: {
                    50: '#f0f9ff',
                    100: '#e0f2fe',
                    200: '#bae6fd',
                    300: '#7dd3fc',
                    400: '#38bdf8',
                    500: '#0ea5e9',
                    600: '#0284c7',
                    700: '#0369a1',
                    800: '#075985',
                    900: '#0c4a6e',
                },
                light: {
                    50: '#ffffff',
                    100: '#f8fafc',
                    200: '#f1f5f9',
                    300: '#e2e8f0',
                    400: '#cbd5e1',
                    500: '#94a3b8',
                    600: '#64748b',
                    700: '#475569',
                    800: '#334155',
                    900: '#1e293b',
                    950: '#0f172a',
                },
                accent: {
                    teal: {
                        DEFAULT: '#14b8a6',
                        light: '#2dd4bf',
                        dark: '#0d9488',
                    },
                    amber: {
                        DEFAULT: '#f59e0b',
                        light: '#fbbf24',
                        dark: '#d97706',
                    },
                    blue: {
                        DEFAULT: '#3b82f6',
                        light: '#60a5fa',
                        dark: '#2563eb',
                    },
                    red: {
                        DEFAULT: '#ef4444',
                        light: '#f87171',
                        dark: '#dc2626',
                    },
                    green: {
                        DEFAULT: '#10b981',
                        light: '#34d399',
                        dark: '#059669',
                    },
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
                display: ['Poppins', 'Inter', 'sans-serif'],
                mono: ['JetBrains Mono', 'Menlo', 'monospace'],
            },
            fontSize: {
                'xs': ['0.75rem', { lineHeight: '1rem' }],
                'sm': ['0.875rem', { lineHeight: '1.25rem' }],
                'base': ['1rem', { lineHeight: '1.5rem' }],
                'lg': ['1.125rem', { lineHeight: '1.75rem' }],
                'xl': ['1.25rem', { lineHeight: '1.75rem' }],
                '2xl': ['1.5rem', { lineHeight: '2rem' }],
                '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
                '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
            },
            spacing: {
                '18': '4.5rem',
                '88': '22rem',
                '100': '25rem',
                '112': '28rem',
                '128': '32rem',
            },
            boxShadow: {
                'soft': '0 2px 8px 0 rgba(0, 0, 0, 0.08)',
                'soft-lg': '0 4px 16px 0 rgba(0, 0, 0, 0.12)',
                'soft-xl': '0 8px 24px 0 rgba(0, 0, 0, 0.16)',
                'glow-teal': '0 0 20px rgba(20, 184, 166, 0.15)',
                'glow-blue': '0 0 20px rgba(59, 130, 246, 0.15)',
                'inner-soft': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
            },
            animation: {
                'fade-in': 'fadeIn 0.3s ease-in-out',
                'slide-up': 'slideUp 0.4s ease-out',
                'slide-down': 'slideDown 0.4s ease-out',
                'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                slideDown: {
                    '0%': { transform: 'translateY(-10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                pulseSoft: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.8' },
                },
            },
            backdropBlur: {
                xs: '2px',
            },
        },
    },
    plugins: [],
}
