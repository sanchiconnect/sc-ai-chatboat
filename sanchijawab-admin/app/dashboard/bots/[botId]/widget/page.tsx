"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError, type WidgetTrigger } from "@/lib/api";

const PRESET_COLORS = ["#3D46C9", "#059669", "#DC2626", "#111827"];

export default function WidgetSettingsPage() {
  const { botId } = useParams<{ botId: string }>();
  const [color, setColor] = useState("#3D46C9");
  const [theme, setTheme] = useState("light");
  const [position, setPosition] = useState("right");
  const [welcome, setWelcome] = useState("");
  const [header, setHeader] = useState("");
  const [requireConsent, setRequireConsent] = useState(true);
  const [consentText, setConsentText] = useState("");
  const [offsetX, setOffsetX] = useState(20);
  const [offsetY, setOffsetY] = useState(20);
  const [desktopEnabled, setDesktopEnabled] = useState(true);
  const [mobileEnabled, setMobileEnabled] = useState(true);
  const [hiddenPaths, setHiddenPaths] = useState("");
  const [starterQuestions, setStarterQuestions] = useState("");
  const [locale, setLocale] = useState("en");
  const [showSources, setShowSources] = useState(true);
  const [triggers, setTriggers] = useState<WidgetTrigger[]>([]);
  const [results, setResults] = useState<Awaited<ReturnType<typeof api.triggerAnalytics>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getWidgetConfig(botId)
      .then((cfg) => {
        setColor(cfg.primary_color);
        setTheme(cfg.theme || "light");
        setPosition(cfg.position);
        setWelcome(cfg.texts.welcome || "");
        setHeader(cfg.texts.header || "");
        setRequireConsent(cfg.require_consent);
        setConsentText(cfg.consent_text || "");
        setOffsetX(cfg.offsets?.x ?? 20);
        setOffsetY(cfg.offsets?.y ?? 20);
        setDesktopEnabled(cfg.devices?.desktop ?? true);
        setMobileEnabled(cfg.devices?.mobile ?? true);
        setHiddenPaths((cfg.hidden_paths || []).join("\n"));
        setStarterQuestions((cfg.starter_questions || []).join("\n"));
        setLocale(cfg.locale || "en");
        setShowSources(cfg.show_sources ?? true);
        setTriggers(cfg.triggers || []);
        api.triggerAnalytics(botId).then(setResults).catch(() => setResults([]));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load widget config"))
      .finally(() => setLoading(false));
  }, [botId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateWidgetConfig(botId, {
        primary_color: color, theme, position, welcome, header,
        require_consent: requireConsent, consent_text: consentText,
        offset_x: offsetX, offset_y: offsetY,
        desktop_enabled: desktopEnabled, mobile_enabled: mobileEnabled,
        hidden_paths: hiddenPaths.split(/[\n,]+/).map((p) => p.trim()).filter(Boolean),
        starter_questions: starterQuestions.split("\n").map((q) => q.trim()).filter(Boolean),
        locale, show_sources: showSources, triggers,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-fg-muted">Loading…</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
      <form onSubmit={save} className="space-y-5">
        <h2 className="text-lg font-bold">Widget</h2>
        <p className="text-sm text-fg-muted -mt-3">
          Takes effect immediately on any site with the widget installed — no re-embedding needed.
        </p>

        {error && <div className="text-sm text-danger bg-danger-soft rounded p-2">{error}</div>}

        <div>
          <label className="text-sm font-medium">Primary colour</label>
          <div className="flex gap-2 mt-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 ${color === c ? "border-fg" : "border-transparent"}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
            <input
              aria-label="Primary color hex value"
              className="border border-border rounded-lg px-2 py-1 text-sm w-28"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Header title</label>
          <input
            className="mt-1 w-full border border-border rounded-lg px-3 py-2"
            value={header}
            onChange={(e) => setHeader(e.target.value)}
            placeholder="Chat with us"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Welcome message</label>
          <input
            className="mt-1 w-full border border-border rounded-lg px-3 py-2"
            value={welcome}
            onChange={(e) => setWelcome(e.target.value)}
            placeholder="Hi! Ask me anything."
          />
        </div>

        <div>
          <label htmlFor="widget-starter-questions" className="text-sm font-medium">Starter questions</label>
          <p className="text-xs text-fg-muted mb-1">
            One per line. Shown as tappable suggestions before the visitor sends their first message. Leave blank
            for none.
          </p>
          <textarea
            id="widget-starter-questions"
            className="w-full border border-border rounded-lg px-3 py-2 h-24 text-sm"
            placeholder={"What are your business hours?\nHow do I reset my password?\nDo you offer refunds?"}
            value={starterQuestions}
            onChange={(e) => setStarterQuestions(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="widget-locale" className="text-sm font-medium">Widget language</label>
          <p className="text-xs text-fg-muted mb-1">
            Translates the widget&apos;s own chrome — input placeholder, consent gate, lead form, button labels.
            The bot&apos;s actual answers already reply in whatever language the visitor writes in, regardless of
            this setting.
          </p>
          <select
            id="widget-locale"
            className="mt-1 w-full border border-border rounded-lg px-3 py-2"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी (Hindi)</option>
          </select>
        </div>

        <div>
          <label htmlFor="widget-theme" className="text-sm font-medium">Theme</label>
          <select
            id="widget-theme"
            className="mt-1 w-full border border-border rounded-lg px-3 py-2"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <div>
          <label htmlFor="widget-position" className="text-sm font-medium">Position</label>
          <select
            id="widget-position"
            className="mt-1 w-full border border-border rounded-lg px-3 py-2"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="widget-offset-x" className="text-sm font-medium">
              Horizontal offset (px)
            </label>
            <input
              id="widget-offset-x"
              type="number"
              min={0}
              className="mt-1 w-full border border-border rounded-lg px-3 py-2"
              value={offsetX}
              onChange={(e) => setOffsetX(Number(e.target.value))}
            />
          </div>
          <div className="flex-1">
            <label htmlFor="widget-offset-y" className="text-sm font-medium">
              Vertical offset (px)
            </label>
            <input
              id="widget-offset-y"
              type="number"
              min={0}
              className="mt-1 w-full border border-border rounded-lg px-3 py-2"
              value={offsetY}
              onChange={(e) => setOffsetY(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <label className="text-sm font-medium block mb-2">Show on</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={desktopEnabled}
                onChange={(e) => setDesktopEnabled(e.target.checked)}
              />
              Desktop
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={mobileEnabled}
                onChange={(e) => setMobileEnabled(e.target.checked)}
              />
              Mobile
            </label>
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <label htmlFor="widget-hidden-paths" className="text-sm font-medium">
            Hide on these pages
          </label>
          <p className="text-xs text-fg-muted mb-1">
            Comma or newline-separated. A plain value matches any URL containing it (e.g. /checkout); end a value
            with * to match a whole section (e.g. /admin/*). Leave blank to show everywhere.
          </p>
          <textarea
            id="widget-hidden-paths"
            className="w-full border border-border rounded-lg px-3 py-2 h-20 text-sm"
            placeholder="/checkout, /admin/*"
            value={hiddenPaths}
            onChange={(e) => setHiddenPaths(e.target.value)}
          />
        </div>

        <div className="border-t border-border pt-5">
          <h3 className="text-sm font-medium">Proactive messages</h3>
          <p className="text-xs text-fg-muted mb-2">
            A small bubble above the chat button that invites the visitor to chat. Each one shows at most once per
            visitor, only while the chat is closed and no conversation has started. Up to 5.
          </p>
          {triggers.map((t, i) => (
            <div key={t.id || i} className="mb-3 rounded-lg border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select
                  aria-label="When to show"
                  className="border border-border rounded-lg px-2 py-1"
                  value={t.type}
                  onChange={(e) => setTriggers(triggers.map((x, j) => (j === i ? { ...x, type: e.target.value as WidgetTrigger["type"], value: e.target.value === "scroll" ? 50 : e.target.value === "time" ? 15 : e.target.value === "visits" ? 2 : 0 } : x)))}
                >
                  <option value="time">After time on page</option>
                  <option value="scroll">After scrolling</option>
                  <option value="exit">When about to leave (desktop)</option>
                  <option value="visits">On a returning visit</option>
                </select>
                {t.type !== "exit" && (
                  <label className="flex items-center gap-1">
                    {t.type === "visits" && "from visit #"}
                    <input
                      type="number" min={t.type === "visits" ? 2 : 1} max={t.type === "time" ? 600 : t.type === "visits" ? 50 : 100}
                      aria-label={t.type === "time" ? "Seconds" : t.type === "visits" ? "Visit number" : "Percent"}
                      className="w-20 border border-border rounded-lg px-2 py-1"
                      value={t.value}
                      onChange={(e) => setTriggers(triggers.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)))}
                    />
                    {t.type === "time" ? "seconds" : t.type === "scroll" ? "% of the page" : ""}
                  </label>
                )}
                <select
                  aria-label="A/B test group"
                  className="border border-border rounded-lg px-2 py-1"
                  value={t.variant ?? ""}
                  onChange={(e) => setTriggers(triggers.map((x, j) => (j === i ? { ...x, variant: e.target.value as "" | "A" | "B" } : x)))}
                >
                  <option value="">Everyone</option>
                  <option value="A">A/B test: group A</option>
                  <option value="B">A/B test: group B</option>
                </select>
                <button
                  type="button"
                  className="ml-auto text-danger text-xs font-semibold"
                  onClick={() => setTriggers(triggers.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
              <input
                aria-label="Message"
                maxLength={140}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="Need help choosing a plan? Ask me anything."
                value={t.message}
                onChange={(e) => setTriggers(triggers.map((x, j) => (j === i ? { ...x, message: e.target.value } : x)))}
              />
              <input
                aria-label="Only on pages matching"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="Only on pages matching (optional), e.g. /pricing or /blog*"
                value={t.page_pattern}
                onChange={(e) => setTriggers(triggers.map((x, j) => (j === i ? { ...x, page_pattern: e.target.value } : x)))}
              />
            </div>
          ))}
          {results.length > 0 && (
            <div className="mb-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <caption className="text-left px-3 py-2 text-fg-muted">Results, last 30 days (saved messages only)</caption>
                <thead className="bg-surface-2 text-left text-fg-muted">
                  <tr><th className="px-3 py-1">Message</th><th className="px-3 py-1">Group</th><th className="px-3 py-1">Shown</th><th className="px-3 py-1">Clicked</th><th className="px-3 py-1">Click rate</th></tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.trigger_id} className="border-t border-border">
                      <td className="px-3 py-1 max-w-[220px] truncate">{r.message}</td>
                      <td className="px-3 py-1">{r.variant || "All"}</td>
                      <td className="px-3 py-1">{r.shown}</td>
                      <td className="px-3 py-1">{r.clicked}</td>
                      <td className="px-3 py-1">{r.click_rate === null ? "—" : `${Math.round(r.click_rate * 100)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {triggers.length < 5 && (
            <button
              type="button"
              className="text-sm font-semibold text-accent"
              onClick={() => setTriggers([...triggers, { id: "", type: "time", value: 15, message: "", page_pattern: "" }])}
            >
              + Add a proactive message
            </button>
          )}
        </div>

        <div className="border-t border-border pt-5">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={showSources}
              onChange={(e) => setShowSources(e.target.checked)}
            />
            Show source links under answers
          </label>
          <p className="text-xs text-fg-muted mt-1 ml-6">Up to 3 links to the pages the answer came from.</p>
        </div>

        <div className="border-t border-border pt-5">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={requireConsent}
              onChange={(e) => setRequireConsent(e.target.checked)}
            />
            Require consent before chat starts (GDPR / India DPDP Act)
          </label>
          {requireConsent && (
            <textarea
              className="mt-2 w-full border border-border rounded-lg px-3 py-2 h-20 text-sm"
              placeholder="By using this chat, you agree that your messages may be stored and used to provide support. Don't share sensitive personal information."
              value={consentText}
              onChange={(e) => setConsentText(e.target.value)}
            />
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-accent text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
        </button>
      </form>

      <div>
        <p className="text-sm font-medium mb-2">Preview</p>
        <div className="bg-surface-2 rounded-xl h-80 relative overflow-hidden border border-border">
          <div
            className="absolute w-64 bg-surface rounded-lg shadow-lg overflow-hidden"
            style={{
              bottom: `${Math.min(offsetY, 200)}px`,
              [position === "left" ? "left" : "right"]: `${Math.min(offsetX, 200)}px`,
            }}
          >
            <div className="px-4 py-3 text-white font-semibold text-sm" style={{ background: color }}>
              {header || "Chat with us"}
            </div>
            <div className="p-3">
              <div className="bg-surface-2 rounded-lg px-3 py-2 text-sm inline-block">
                {welcome || "Hi! Ask me anything."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
