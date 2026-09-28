import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: "#3525cd",
        "primary-container": "#4f46e5",
        "on-primary": "#ffffff",
        "inverse-surface": "#283044",
        "inverse-on-surface": "#eef0ff",
        surface: "#faf8ff",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f2f3ff",
        "surface-container": "#eaedff",
        "surface-container-high": "#e2e7ff",
        "surface-container-highest": "#dae2fd",
        "on-surface": "#131b2e",
        "on-surface-variant": "#464555",
        outline: "#777587",
        "outline-variant": "#c7c4d8",
        tertiary: "#00505f",
        error: "#ba1a1a",
      },
      fontFamily: {
        "body-md": ["Inter", "sans-serif"],
        "label-md": ["Inter", "sans-serif"],
        "label-sm": ["Inter", "sans-serif"],
        "headline-md": ["Plus Jakarta Sans", "sans-serif"],
      },
      fontSize: {
        "body-sm": ["12px", { lineHeight: "18px" }],
        "body-md": ["14px", { lineHeight: "20px" }],
        "label-sm": ["11px", { lineHeight: "16px" }],
        "label-md": ["13px", { lineHeight: "18px" }],
      },
    },
  },
  plugins: [],
};

export default config;
