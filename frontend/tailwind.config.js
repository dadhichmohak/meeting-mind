/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand palette (CSS variable based for theme switching)
        bg:        "var(--bg)",
        surface:   "var(--surface)",
        "surface-secondary": "var(--surface-secondary)",
        "surface-hover": "var(--surface-hover)",
        border:    "var(--border)",
        "border-light": "var(--border-light)",
        // Text
        primary:   "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted:     "var(--text-muted)",
        disabled:  "var(--text-disabled)",
        placeholder: "var(--text-placeholder)",
        // Accent
        accent:    "var(--accent)",
        "accent-secondary": "var(--accent-secondary)",
        "accent-tertiary": "var(--accent-tertiary)",
        highlight: "var(--highlight)",
        // Status
        success:   "var(--success)",
        warning:   "var(--warning)",
        error:     "var(--error)",
        recording: "var(--recording)",
        // Sidebar
        "sidebar-bg":     "var(--sidebar-bg)",
        "sidebar-active": "var(--sidebar-active)",
        "sidebar-hover":  "var(--sidebar-hover)",
      },
      fontFamily: {
        serif: ["'Instrument Serif'", "Georgia", "serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      borderRadius: {
        "4xl": "28px",
        "5xl": "32px",
      },
      boxShadow: {
        "soft": "0 2px 6px rgba(0,0,0,0.12)",
      },
      animation: {
        "fade-in-up": "fadeInUp 0.3s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
