import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";

const config: Config = {
  // 1. CRITICAL: Enables class-based dark mode
  darkMode: "class",

  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        // 2. Added Shimmer for progress bars and loading states
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2s infinite',
        // 3. Added a smoother spin for AI icons (used in your code)
        'spin-slow': 'spin 3s linear infinite',
      },
    },
  },
  plugins: [tailwindAnimate],
};

export default config;