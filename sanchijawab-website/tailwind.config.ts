import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  // Theming is token-based (CSS custom properties that change value under
  // prefers-color-scheme / [data-theme]), not Tailwind's dark: class variant
  // — matches sanchijawab-admin's system exactly. No dark: utilities used.
  content: ["./app/**/*.{ts,tsx,mdx}", "./components/**/*.{ts,tsx}", "./content/**/*.{md,mdx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1240px" },
    },
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        fg: "var(--fg)",
        "fg-muted": "var(--fg-muted)",
        "fg-faint": "var(--fg-faint)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        "accent-soft": "var(--accent-soft)",
        warm: "var(--warm)",
        "warm-soft": "var(--warm-soft)",
        success: "var(--success)",
        "success-soft": "var(--success-soft)",
        warning: "var(--warning)",
        "warning-soft": "var(--warning-soft)",
        danger: "var(--danger)",
        "danger-soft": "var(--danger-soft)",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-sora)", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,26,46,.04), 0 8px 24px -12px rgba(28,26,46,.12)",
        "card-dark": "0 1px 2px rgba(0,0,0,.3), 0 8px 24px -12px rgba(0,0,0,.5)",
      },
      borderRadius: {
        xl2: "16px",
        btn: "10px",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(16px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        blink: { "0%,49%": { opacity: "1" }, "50%,100%": { opacity: "0" } },
        "count-pulse": { "0%": { opacity: "0.6" }, "100%": { opacity: "1" } },
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "fade-up": "fade-up .6s ease both",
        "fade-in": "fade-in .5s ease both",
        blink: "blink 1s step-end infinite",
        "accordion-down": "accordion-down .2s ease",
        "accordion-up": "accordion-up .2s ease",
      },
    },
  },
  plugins: [typography],
} satisfies Config;
