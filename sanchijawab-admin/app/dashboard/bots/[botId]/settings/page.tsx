"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { AVATAR_PRESETS, BotAvatar } from "@/lib/avatars";

export default function BotSettingsPage() {
  const { botId } = useParams<{ botId: string }>();
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [instructions, setInstructions] = useState("");
  const [allowedDomains, setAllowedDomains] = useState("");
  const [modelTier, setModelTier] = useState("balanced");
  const [handoffKeywords, setHandoffKeywords] = useState("");
  const [avatarId, setAvatarId] = useState("orbit");
  const [avatarName, setAvatarName] = useState("");
  const [retentionDays, setRetentionDays] = useState("");
  const [visitorId, setVisitorId] = useState("");
  const [privacyMsg, setPrivacyMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getBot(botId)
      .then((bot) => {
        setName(bot.name);
        setPersona(bot.persona);
        setInstructions(bot.instructions);
        setAllowedDomains((bot.allowed_domains || []).join(", "));
        setModelTier(bot.model_tier || "balanced");
        setHandoffKeywords(bot.handoff_keywords || "");
        setAvatarId(bot.avatar_id || "orbit");
        setAvatarName(bot.avatar_name || "");
        setRetentionDays(bot.retention_days ? String(bot.retention_days) : "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load bot"))
      .finally(() => setLoading(false));
  }, [botId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const allowed_domains = allowedDomains
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      await api.updateBot(botId, {
        name, persona, instructions, allowed_domains, model_tier: modelTier,
        avatar_id: avatarId, avatar_name: avatarName, handoff_keywords: handoffKeywords,
        retention_days: Number(retentionDays) > 0 ? Math.floor(Number(retentionDays)) : 0,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function exportVisitor() {
    setPrivacyMsg(null);
    try {
      const data = await api.exportVisitorData(botId, visitorId.trim());
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `visitor-${visitorId.trim()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPrivacyMsg(err instanceof ApiError ? err.message : "Export failed");
    }
  }

  async function eraseVisitor() {
    if (!window.confirm("Permanently delete every conversation, message and lead stored for this visitor?")) return;
    setPrivacyMsg(null);
    try {
      const res = await api.eraseVisitorData(botId, visitorId.trim());
      setPrivacyMsg(`Deleted ${res.deleted_conversations} conversation(s).`);
    } catch (err) {
      setPrivacyMsg(err instanceof ApiError ? err.message : "Erase failed");
    }
  }

  if (loading) return <p className="text-fg-muted">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-10">
    <form onSubmit={save} className="space-y-5">
      <h2 className="text-lg font-bold">Bot settings</h2>
      <p className="text-sm text-fg-muted -mt-3">
        Persona and instructions change how the bot actually answers — they&apos;re sent to the model on every question.
      </p>

      {error && <div className="text-sm text-danger bg-danger-soft rounded p-2">{error}</div>}

      <div>
        <label className="text-sm font-medium">Bot name</label>
        <input
          className="mt-1 w-full border border-border rounded-lg px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Avatar</label>
        <p className="text-xs text-fg-muted mb-2">
          Shown in the chat widget&apos;s header, next to its name below.
        </p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setAvatarId(preset.id)}
              title={preset.label}
              className={`rounded-full p-0.5 border-2 transition-colors ${
                avatarId === preset.id ? "border-accent" : "border-transparent hover:border-border"
              }`}
            >
              <BotAvatar avatarId={preset.id} size={36} />
            </button>
          ))}
        </div>
        <input
          className="mt-3 w-full border border-border rounded-lg px-3 py-2"
          placeholder="Avatar's name (e.g. Riya) — shown in the widget header"
          value={avatarName}
          onChange={(e) => setAvatarName(e.target.value)}
          maxLength={100}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Persona / tone</label>
        <input
          className="mt-1 w-full border border-border rounded-lg px-3 py-2"
          placeholder="e.g. Friendly and concise, uses simple language"
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Custom instructions</label>
        <textarea
          className="mt-1 w-full border border-border rounded-lg px-3 py-2 h-32"
          placeholder="e.g. Always recommend booking a demo call for enterprise questions."
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="bot-model-tier" className="text-sm font-medium">Answer quality</label>
        <p className="text-xs text-fg-muted mb-1">
          Higher quality costs more per answer. Balanced is a good default for most bots.
        </p>
        <select
          id="bot-model-tier"
          className="mt-1 w-full border border-border rounded-lg px-3 py-2"
          value={modelTier}
          onChange={(e) => setModelTier(e.target.value)}
        >
          <option value="economy">Economy — fastest, cheapest</option>
          <option value="balanced">Balanced (recommended)</option>
          <option value="quality">Quality — best answers, slower and pricier</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Always hand off on these phrases</label>
        <p className="text-xs text-fg-muted mb-1">
          Comma or newline-separated. If a visitor&apos;s message contains any of these, the bot connects them with
          your team immediately instead of answering — useful for terms you always want a human on (e.g. refund,
          cancel subscription, lawyer). Leave blank to rely on the bot&apos;s own judgment only.
        </p>
        <textarea
          className="mt-1 w-full border border-border rounded-lg px-3 py-2 h-20"
          placeholder="refund, cancel subscription, lawyer"
          value={handoffKeywords}
          onChange={(e) => setHandoffKeywords(e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Allowed domains</label>
        <p className="text-xs text-fg-muted mb-1">
          Comma-separated (e.g. example.com, app.example.com). Leave blank to allow embedding on any site.
        </p>
        <input
          className="mt-1 w-full border border-border rounded-lg px-3 py-2"
          placeholder="example.com, app.example.com"
          value={allowedDomains}
          onChange={(e) => setAllowedDomains(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="bot-retention" className="text-sm font-medium">Delete conversations after (days)</label>
        <p className="text-xs text-fg-muted mb-1">
          Conversations, messages and leads older than this are deleted automatically (checked hourly by the worker).
          Leave blank to keep everything.
        </p>
        <input
          id="bot-retention"
          type="number"
          min={1}
          className="mt-1 w-40 border border-border rounded-lg px-3 py-2"
          placeholder="e.g. 90"
          value={retentionDays}
          onChange={(e) => setRetentionDays(e.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="bg-accent text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50"
      >
        {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
      </button>
    </form>

    <section className="space-y-3 border-t border-border pt-6">
      <h3 className="text-base font-bold">Visitor data requests</h3>
      <p className="text-sm text-fg-muted">
        Export or permanently erase everything stored about one visitor (GDPR / India DPDP Act). The visitor id is
        shown on each conversation in the Inbox.
      </p>
      {privacyMsg && <div className="text-sm bg-surface-2 rounded p-2">{privacyMsg}</div>}
      <label htmlFor="visitor-id" className="text-sm font-medium">Visitor id</label>
      <input
        id="visitor-id"
        className="w-full border border-border rounded-lg px-3 py-2"
        value={visitorId}
        onChange={(e) => setVisitorId(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!visitorId.trim()}
          onClick={exportVisitor}
          className="border border-border rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Export data
        </button>
        <button
          type="button"
          disabled={!visitorId.trim()}
          onClick={eraseVisitor}
          className="bg-danger text-on-danger rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Erase data
        </button>
      </div>
    </section>
    </div>
  );
}
