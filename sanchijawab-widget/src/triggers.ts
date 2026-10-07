// Proactive triggers (Phase 2): a nudge bubble above the launcher when a
// visitor has spent N seconds on a page, scrolled N% down it, or moved the
// mouse out through the top of the window (exit intent, desktop only).
// A trigger fires at most once per visitor (remembered in localStorage).

export interface Trigger {
  id: string;
  type: "time" | "scroll" | "exit";
  value: number; // seconds for "time", percent for "scroll", unused for "exit"
  message: string;
  page_pattern: string; // empty = every page; trailing * = prefix match; else substring
}

const KEY = (botId: string, id: string) => `sanchijawab:${botId}:trigger:${id}`;

export function pageMatches(pattern: string, pathname: string): boolean {
  const p = (pattern || "").trim();
  if (!p) return true;
  return p.endsWith("*") ? pathname.startsWith(p.slice(0, -1)) : pathname.includes(p);
}

function alreadyFired(botId: string, id: string): boolean {
  try {
    return localStorage.getItem(KEY(botId, id)) === "1";
  } catch {
    return false;
  }
}

function markFired(botId: string, id: string) {
  try {
    localStorage.setItem(KEY(botId, id), "1");
  } catch {
    /* storage blocked — the nudge may repeat on the next page load, which is acceptable */
  }
}

/** Starts watching; returns a function that stops everything. */
export function watchTriggers(
  botId: string,
  triggers: Trigger[],
  pathname: string,
  isMobile: boolean,
  onFire: (trigger: Trigger) => void,
): () => void {
  const cleanups: (() => void)[] = [];
  let fired = false; // one nudge per page view, even if several triggers match

  const fire = (t: Trigger) => {
    if (fired || alreadyFired(botId, t.id)) return;
    fired = true;
    markFired(botId, t.id);
    onFire(t);
  };

  for (const t of triggers) {
    if (alreadyFired(botId, t.id) || !pageMatches(t.page_pattern, pathname)) continue;

    if (t.type === "time") {
      const timer = window.setTimeout(() => fire(t), Math.max(1, t.value) * 1000);
      cleanups.push(() => window.clearTimeout(timer));
    } else if (t.type === "scroll") {
      const onScroll = () => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        if (scrollable <= 0) return;
        if ((window.scrollY / scrollable) * 100 >= t.value) fire(t);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      cleanups.push(() => window.removeEventListener("scroll", onScroll));
    } else if (t.type === "exit" && !isMobile) {
      const onLeave = (e: MouseEvent) => {
        if (e.clientY <= 0) fire(t);
      };
      document.documentElement.addEventListener("mouseleave", onLeave);
      cleanups.push(() => document.documentElement.removeEventListener("mouseleave", onLeave));
    }
  }
  return () => cleanups.forEach((c) => c());
}
