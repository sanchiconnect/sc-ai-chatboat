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
  const [avatarId, setAvatarId] = useState("orbit");
  const [avatarName, setAvatarName] = useState("");
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
        setAvatarId(bot.avatar_id || "orbit");
        setAvatarName(bot.avatar_name || "");
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
        name, persona, instructions, allowed_domains,
        avatar_id: avatarId, avatar_name: avatarName,
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
    <form onSubmit={save} className="max-w-2xl space-y-5">
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
          Shown in the chat widget's header, next to its name below.
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

      <button
        type="submit"
        disabled={saving}
        className="bg-accent text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50"
      >
        {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
      </button>
    </form>
  );
}
