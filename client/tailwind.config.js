/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#f0f9ff',
                    100: '#e0f2fe',
                    600: '#0284c7', // Your primary blue
                    700: '#0369a1',
                },
                light: {
                    100: '#f8fafc',
                    300: '#e2e8f0',
                    400: '#cbd5e1',
                    500: '#94a3b8',
                    900: '#0f172a', // Dark text
                },
                accent: {
                    teal: {
                        light: '#2dd4bf',
                    },
                    red: {
                        light: '#f87171',
                        dark: '#dc2626',
                    }
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                display: ['Poppins', 'Inter', 'sans-serif'],
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out',
                'slide-up': 'slideUp 0.5s ease-out',
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
            },
        },
    },
    plugins: [],
}