// A faithful mock of the chat widget on a website, redrawn live as the owner edits the settings.
// It is purely visual (no network, no real widget code) and uses fixed colours so it looks the same
// whether the dashboard itself is in light or dark mode.

type Props = {
  color: string;
  theme: string;
  position: string;
  header: string;
  welcome: string;
  starters: string[];
  offsetX: number;
  offsetY: number;
  showSources: boolean;
};

const PALETTE = {
  light: { panel: "#ffffff", text: "#1c1a2e", muted: "#6b6880", bubble: "#f1f0f8", border: "#e3e1ef", input: "#f6f5fb" },
  dark: { panel: "#1d1a2b", text: "#efedfa", muted: "#a6a2be", bubble: "#2a2740", border: "#3e3a58", input: "#262338" },
};

export function WidgetPreview({ color, theme, position, header, welcome, starters, offsetX, offsetY, showSources }: Props) {
  const p = theme === "dark" ? PALETTE.dark : PALETTE.light;
  const side = position === "left" ? "left" : "right";
  // The frame is smaller than a real screen, so offsets are scaled down but stay proportional.
  const x = 12 + Math.min(Math.max(offsetX, 0), 200) * 0.4;
  const y = 12 + Math.min(Math.max(offsetY, 0), 200) * 0.4;
  const title = header || "Chat with us";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card" aria-label="Live preview of your chat widget">
      {/* browser chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 flex-1 truncate rounded-md bg-surface px-3 py-1 text-[11px] text-fg-faint">yourwebsite.com</span>
      </div>

      {/* the "website" behind the widget */}
      <div className="relative h-[460px] overflow-hidden bg-[#f4f4f8]" style={{ colorScheme: "light" }}>
        <div className="space-y-3 p-5" aria-hidden="true">
          <div className="h-3 w-28 rounded bg-[#d9d9e4]" />
          <div className="h-6 w-3/4 rounded bg-[#cfcfdc]" />
          <div className="h-3 w-full rounded bg-[#e1e1ea]" />
          <div className="h-3 w-5/6 rounded bg-[#e1e1ea]" />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="h-16 rounded-lg bg-[#e6e6ee]" />
            <div className="h-16 rounded-lg bg-[#e6e6ee]" />
            <div className="h-16 rounded-lg bg-[#e6e6ee]" />
          </div>
          <div className="h-3 w-2/3 rounded bg-[#e1e1ea]" />
        </div>

        {/* chat window */}
        <div
          className="absolute flex w-[min(290px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl shadow-[0_18px_50px_-12px_rgba(20,18,42,0.45)]"
          style={{ [side]: x, bottom: y + 62, background: p.panel, color: p.text, border: `1px solid ${p.border}` } as React.CSSProperties}
        >
          <div className="flex items-center gap-2.5 px-3.5 py-3 text-white" style={{ background: color }}>
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-white/25" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{title}</span>
            <span className="text-[18px] leading-none opacity-80" aria-hidden="true">×</span>
          </div>

          <div className="flex flex-col gap-2 px-3 py-3 text-[12.5px]">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md px-3 py-2" style={{ background: p.bubble }}>
              {welcome || "Hi! Ask me anything."}
            </div>
            <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md px-3 py-2 text-white" style={{ background: color }}>
              What are your opening hours?
            </div>
            <div className="max-w-[88%] rounded-2xl rounded-bl-md px-3 py-2" style={{ background: p.bubble }}>
              We&apos;re open Monday to Saturday, 9am to 6pm.
              {showSources && <div className="mt-1 text-[11px] underline" style={{ color }}>Source</div>}
            </div>
            {starters.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-1.5">
                {starters.slice(0, 3).map((q, i) => (
                  <span key={i} className="truncate rounded-full px-2.5 py-1 text-[11px]" style={{ border: `1px solid ${color}`, color }}>
                    {q}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-3 pb-2.5 pt-1.5" style={{ borderTop: `1px solid ${p.border}` }}>
            <span className="flex-1 rounded-full px-3 py-1.5 text-[11.5px]" style={{ background: p.input, color: p.muted }}>Type a message…</span>
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-white" style={{ background: color }} aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20v-6l8-2-8-2V4l19 8z" /></svg>
            </span>
          </div>
          <div className="pb-2 text-center text-[10px]" style={{ color: p.muted }}>Powered by SanchiJawab</div>
        </div>

        {/* launcher bubble */}
        <span
          className="absolute flex h-[50px] w-[50px] items-center justify-center rounded-full text-white shadow-[0_8px_22px_-6px_rgba(20,18,42,0.5)]"
          style={{ [side]: x, bottom: y, background: color } as React.CSSProperties}
          aria-hidden="true"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </span>
      </div>
    </div>
  );
}
