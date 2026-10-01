"use client";

import { useEffect, useState } from "react";

function resolveCurrent(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setThemeState] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setThemeState(resolveCurrent());
  }, []);

  function toggle() {
    const next = resolveCurrent() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("sj-theme", next);
    } catch {
      // private window / blocked storage — theme just won't persist
    }
    setThemeState(next);
  }

  // Avoid rendering the wrong icon for a frame before the effect resolves it.
  if (theme === null) return <div className={`w-8 h-8 ${className}`} />;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className={`w-8 h-8 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors ${className}`}
    >
      {theme === "dark" ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.55 1.55M17.55 17.55l1.55 1.55M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.55-1.55M17.55 6.45l1.55-1.55" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.6 15.2a8.7 8.7 0 0 1-10.8-10.8 1 1 0 0 0-1.3-1.2A9.7 9.7 0 1 0 21.8 16.5a1 1 0 0 0-1.2-1.3Z" />
        </svg>
      )}
    </button>
  );
}
