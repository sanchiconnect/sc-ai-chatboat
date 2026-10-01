"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";

const PRESET_COLORS = ["#3D46C9", "#059669", "#DC2626", "#111827"];

export default function WidgetSettingsPage() {
  const { botId } = useParams<{ botId: string }>();
  const [color, setColor] = useState("#3D46C9");
  const [position, setPosition] = useState("right");
  const [welcome, setWelcome] = useState("");
  const [header, setHeader] = useState("");
  const [requireConsent, setRequireConsent] = useState(true);
  const [consentText, setConsentText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getWidgetConfig(botId)
      .then((cfg) => {
        setColor(cfg.primary_color);
        setPosition(cfg.position);
        setWelcome(cfg.texts.welcome || "");
        setHeader(cfg.texts.header || "");
        setRequireConsent(cfg.require_consent);
        setConsentText(cfg.consent_text || "");
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
        primary_color: color, position, welcome, header,
        require_consent: requireConsent, consent_text: consentText,
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
          <label className="text-sm font-medium">Position</label>
          <select
            className="mt-1 w-full border border-border rounded-lg px-3 py-2"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
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
            className={`absolute bottom-4 ${position === "left" ? "left-4" : "right-4"} w-64 bg-surface rounded-lg shadow-lg overflow-hidden`}
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
