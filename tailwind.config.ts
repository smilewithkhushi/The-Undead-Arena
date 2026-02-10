import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        fredoka: ['"Fredoka"', '"Segoe UI"', "sans-serif"],
        chewy: ['"Chewy"', "cursive"]
      },
      colors: {
        "lawn-green": "#7ec850",
        "dark-green": "#4a7c2c",
        "zombie-skin": "#a8d884",
        "pea-green": "#8fd14f",
        "bright-yellow": "#ffd93d",
        "orange-pea": "#ff9234",
        "danger-red": "#e74c3c",
        "sky-blue": "#87ceeb",
        "cart-brown": "#8b4513",
        "laser-purple": "#9b59b6",
        "laser-glow": "#e056fd",
        "text-stroke": "#2c3e50",
        "score-yellow": "#fff176",
        "panel-bg": "rgba(255, 255, 255, 0.9)"
      },
      borderRadius: {
        "18": "18px",
        "22": "22px",
        "24": "24px",
        pill: "999px"
      },
      keyframes: {
        "bounce-title": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-16px)" }
        }
      },
      animation: {
        "bounce-title": "bounce-title 0.6s ease-out"
      }
    }
  },
  plugins: []
};

export default config;
