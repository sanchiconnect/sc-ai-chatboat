"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps a screen fresh without a manual refresh: calls `refresh` every `ms`
 * while the tab is visible, and again the moment the person comes back to the
 * tab. It never runs in a hidden tab, so it costs nothing in the background.
 * The first load stays with the page's own effect; this only adds the updates.
 */
export function useLive(refresh: () => unknown, ms = 8000, deps: unknown[] = []) {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    const id = setInterval(tick, ms);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}

/** Ask every notification bell on the page to refetch right now (after an action). */
export function pingNotifications() {
  window.dispatchEvent(new Event("sj:notifications"));
}
