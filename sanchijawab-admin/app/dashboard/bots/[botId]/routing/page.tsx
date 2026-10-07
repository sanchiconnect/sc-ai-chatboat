"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError, BusinessHours } from "@/lib/api";

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

type DayHours = { open: boolean; start: string; end: string };
type Team = { team_id: string; name: string };
type RoutingRule = { rule_id: string; team_id: string; page_pattern: string; language: string; priority: number };

export default function RoutingPage() {
  const { botId } = useParams<{ botId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [timezone, setTimezone] = useState("UTC");
  const [days, setDays] = useState<Record<string, DayHours>>(
    Object.fromEntries(DAYS.map((d) => [d.key, { open: false, start: "09:00", end: "18:00" }])),
  );
  const [savingHours, setSavingHours] = useState(false);
  const [hoursSaved, setHoursSaved] = useState(false);

  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState("");

  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [newRule, setNewRule] = useState({ team_id: "", page_pattern: "", language: "", priority: 0 });

  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [savingSlack, setSavingSlack] = useState(false);
  const [slackSaved, setSlackSaved] = useState(false);

  useEffect(() => {
    Promise.all([api.getBot(botId), api.listTeams(botId), api.listRoutingRules(botId)])
      .then(([bot, teamList, ruleList]) => {
        const bh: BusinessHours = bot.business_hours || {};
        setTimezone(bh.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
        if (bh.hours) {
          setDays((prev) => {
            const next = { ...prev };
            for (const d of DAYS) {
              const windows = bh.hours?.[d.key];
              if (windows && windows.length > 0) {
                next[d.key] = { open: true, start: windows[0][0], end: windows[0][1] };
              }
            }
            return next;
          });
        }
        setTeams(teamList);
        setRules(ruleList);
        setSlackWebhookUrl(bot.slack_webhook_url || "");
        if (teamList.length > 0) setNewRule((r) => ({ ...r, team_id: teamList[0].team_id }));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load routing settings"))
      .finally(() => setLoading(false));
  }, [botId]);

  async function saveSlackWebhook(e: React.FormEvent) {
    e.preventDefault();
    setSavingSlack(true);
    setError(null);
    try {
      await api.updateBot(botId, { slack_webhook_url: slackWebhookUrl.trim() });
      setSlackSaved(true);
      setTimeout(() => setSlackSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save Slack webhook");
    } finally {
      setSavingSlack(false);
    }
  }

  async function saveBusinessHours(e: React.FormEvent) {
    e.preventDefault();
    setSavingHours(true);
    setError(null);
    try {
      const anyOpen = Object.values(days).some((d) => d.open);
      const business_hours: BusinessHours = anyOpen
        ? {
            timezone,
            hours: Object.fromEntries(
              DAYS.filter((d) => days[d.key].open).map((d) => [d.key, [[days[d.key].start, days[d.key].end]]]),
            ),
          }
        : {};
      await api.updateBot(botId, { business_hours });
      setHoursSaved(true);
      setTimeout(() => setHoursSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save business hours");
    } finally {
      setSavingHours(false);
    }
  }

  async function addTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    try {
      const team = await api.createTeam(botId, newTeamName.trim());
      setTeams((prev) => [...prev, team]);
      setNewTeamName("");
      setNewRule((r) => (r.team_id ? r : { ...r, team_id: team.team_id }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add team");
    }
  }

  async function removeTeam(teamId: string) {
    try {
      await api.deleteTeam(teamId);
      setTeams((prev) => prev.filter((t) => t.team_id !== teamId));
      setRules((prev) => prev.filter((r) => r.team_id !== teamId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove team");
    }
  }

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newRule.team_id) return;
    try {
      const rule = await api.createRoutingRule(botId, newRule);
      setRules((prev) => [...prev, rule].sort((a, b) => a.priority - b.priority));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add routing rule");
    }
  }

  async function removeRule(ruleId: string) {
    try {
      await api.deleteRoutingRule(ruleId);
      setRules((prev) => prev.filter((r) => r.rule_id !== ruleId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove routing rule");
    }
  }

  if (loading) return <p className="text-fg-muted">Loading…</p>;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-bold">Routing &amp; business hours</h2>
        <p className="text-sm text-fg-muted">
          Decide who a handed-off conversation goes to, and what visitors hear outside business hours.
        </p>
      </div>

      {error && <div className="text-sm text-danger bg-danger-soft rounded p-2">{error}</div>}

      <section className="border border-border rounded-lg p-4">
        <h3 className="font-semibold mb-1">Business hours</h3>
        <p className="text-xs text-fg-muted mb-3">
          When no day is open, the bot is treated as always available — matching how it behaved before this was
          configurable. Outside the hours below, a handoff gets a &quot;we&apos;re currently offline&quot; message
          instead of &quot;someone will be with you shortly.&quot;
        </p>
        <form onSubmit={saveBusinessHours} className="space-y-3">
          <div>
            <label className="text-sm font-medium">Timezone</label>
            <input
              className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. Asia/Kolkata"
            />
          </div>
          <div className="space-y-1.5">
            {DAYS.map((d) => (
              <div key={d.key} className="flex items-center gap-3">
                <label className="flex items-center gap-2 w-20 text-sm">
                  <input
                    type="checkbox"
                    checked={days[d.key].open}
                    onChange={(e) =>
                      setDays((prev) => ({ ...prev, [d.key]: { ...prev[d.key], open: e.target.checked } }))
                    }
                  />
                  {d.label}
                </label>
                <input
                  type="time"
                  className="border border-border rounded-lg px-2 py-1 text-sm disabled:opacity-40"
                  disabled={!days[d.key].open}
                  value={days[d.key].start}
                  onChange={(e) =>
                    setDays((prev) => ({ ...prev, [d.key]: { ...prev[d.key], start: e.target.value } }))
                  }
                />
                <span className="text-fg-muted text-sm">to</span>
                <input
                  type="time"
                  className="border border-border rounded-lg px-2 py-1 text-sm disabled:opacity-40"
                  disabled={!days[d.key].open}
                  value={days[d.key].end}
                  onChange={(e) =>
                    setDays((prev) => ({ ...prev, [d.key]: { ...prev[d.key], end: e.target.value } }))
                  }
                />
              </div>
            ))}
          </div>
          <button
            type="submit"
            disabled={savingHours}
            className="bg-accent text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {savingHours ? "Saving…" : hoursSaved ? "Saved!" : "Save business hours"}
          </button>
        </form>
      </section>

      <section className="border border-border rounded-lg p-4">
        <h3 className="font-semibold mb-1">Teams</h3>
        <p className="text-xs text-fg-muted mb-3">
          Named destinations for handoffs — e.g. &quot;Sales&quot;, &quot;Support (EU)&quot;. The Inbox can filter by team once
          conversations are routed to one below.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {teams.length === 0 && <p className="text-sm text-fg-muted">No teams yet.</p>}
          {teams.map((t) => (
            <span
              key={t.team_id}
              className="inline-flex items-center gap-1.5 bg-surface-2 border border-border rounded-full px-3 py-1 text-sm"
            >
              {t.name}
              <button
                type="button"
                onClick={() => removeTeam(t.team_id)}
                className="text-fg-faint hover:text-danger"
                aria-label={`Remove ${t.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <form onSubmit={addTeam} className="flex gap-2">
          <input
            className="flex-1 border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="New team name"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
          />
          <button type="submit" className="border border-border rounded-lg px-4 py-2 text-sm font-medium">
            Add team
          </button>
        </form>
      </section>

      <section className="border border-border rounded-lg p-4">
        <h3 className="font-semibold mb-1">Routing rules</h3>
        <p className="text-xs text-fg-muted mb-3">
          Evaluated top to bottom (lowest priority number first); the first rule whose page and language both match
          wins. Leave a field blank to match anything. A conversation that matches no rule stays unrouted.
        </p>

        {rules.length > 0 && (
          <div className="border border-border rounded-lg overflow-x-auto mb-3">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left">
                <tr>
                  <th className="p-2">Priority</th>
                  <th className="p-2">Page contains</th>
                  <th className="p-2">Language</th>
                  <th className="p-2">Team</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rules.map((r) => (
                  <tr key={r.rule_id}>
                    <td className="p-2">{r.priority}</td>
                    <td className="p-2">{r.page_pattern || <span className="text-fg-faint">any</span>}</td>
                    <td className="p-2">{r.language || <span className="text-fg-faint">any</span>}</td>
                    <td className="p-2">{teams.find((t) => t.team_id === r.team_id)?.name || "—"}</td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeRule(r.rule_id)}
                        className="text-xs text-danger font-medium"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {teams.length === 0 ? (
          <p className="text-sm text-fg-muted">Add a team above before creating routing rules.</p>
        ) : (
          <form onSubmit={addRule} className="flex gap-2 flex-wrap items-end">
            <div>
              <label className="text-xs font-medium block mb-1">Page contains</label>
              <input
                className="border border-border rounded-lg px-2 py-1.5 text-sm w-40"
                placeholder="/pricing"
                value={newRule.page_pattern}
                onChange={(e) => setNewRule((r) => ({ ...r, page_pattern: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Language</label>
              <input
                className="border border-border rounded-lg px-2 py-1.5 text-sm w-24"
                placeholder="fr"
                value={newRule.language}
                onChange={(e) => setNewRule((r) => ({ ...r, language: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Team</label>
              <select
                className="border border-border rounded-lg px-2 py-1.5 text-sm"
                value={newRule.team_id}
                onChange={(e) => setNewRule((r) => ({ ...r, team_id: e.target.value }))}
                aria-label="Team"
              >
                {teams.map((t) => (
                  <option key={t.team_id} value={t.team_id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Priority</label>
              <input
                type="number"
                className="border border-border rounded-lg px-2 py-1.5 text-sm w-20"
                value={newRule.priority}
                onChange={(e) => setNewRule((r) => ({ ...r, priority: Number(e.target.value) }))}
              />
            </div>
            <button type="submit" className="bg-accent text-white rounded-lg px-4 py-2 text-sm font-medium">
              Add rule
            </button>
          </form>
        )}
      </section>

      <section className="border border-border rounded-lg p-4">
        <h3 className="font-semibold mb-1">Slack notifications</h3>
        <p className="text-xs text-fg-muted mb-3">
          Optional — posts to this Slack incoming-webhook URL every time this bot hands a conversation off to a
          human, in addition to in-app and (opt-out) email notifications. Leave blank to disable.
        </p>
        <form onSubmit={saveSlackWebhook} className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[260px]">
            <label className="text-sm font-medium">Slack webhook URL</label>
            <input
              className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="https://hooks.slack.com/services/..."
              value={slackWebhookUrl}
              onChange={(e) => setSlackWebhookUrl(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={savingSlack}
            className="bg-accent text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {savingSlack ? "Saving…" : slackSaved ? "Saved!" : "Save"}
          </button>
        </form>
      </section>
    </div>
  );
}
