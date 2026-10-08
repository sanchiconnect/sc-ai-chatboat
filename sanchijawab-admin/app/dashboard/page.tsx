"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { ProfileMenu } from "@/components/ProfileMenu";
import { useLive } from "@/lib/use-live";
import { resolveWorkspace } from "@/lib/workspace-store";

interface Workspace {
  workspace_id: string;
  name: string;
  role: string;
}
interface Bot {
  bot_id: string;
  name: string;
  created_at: string;
}

// A stable colour per bot (same name, same colour) so cards are easy to tell
// apart at a glance. Lightness is fixed so white text always stays readable.
function botGradient(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 62% 44%), hsl(${(h + 35) % 360} 62% 34%))`;
}

export default function DashboardOverview() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [newBotName, setNewBotName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    try {
      const list = await api.listWorkspaces();
      setWorkspaces(list);
      const ws = resolveWorkspace(list);
      if (!ws) {
        setError("No workspace found for this account.");
        return;
      }
      setWorkspace(ws);
      setBots(await api.listBots(ws.workspace_id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    api.me().then((m) => setEmail(m.email)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New/deleted bots (e.g. by a teammate) show up without a refresh.
  useLive(() => {
    if (workspace) api.listBots(workspace.workspace_id).then(setBots).catch(() => {});
  }, 10_000, [workspace?.workspace_id]);

  async function createBot(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !newBotName.trim()) return;
    setCreating(true);
    try {
      const { bot_id } = await api.createBot(workspace.workspace_id, newBotName.trim());
      router.push(`/dashboard/bots/${bot_id}/settings`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create bot");
      setCreating(false);
    }
  }

  async function deleteBot(e: React.MouseEvent, botId: string) {
    e.preventDefault(); // the card itself is a link to the bot's settings
    e.stopPropagation();
    if (!window.confirm("Delete this bot? This removes its knowledge, conversations and leads too — it can't be undone.")) return;
    setDeletingId(botId);
    try {
      await api.deleteBot(botId);
      setBots((prev) => prev.filter((b) => b.bot_id !== botId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete bot");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-[1240px] mx-auto grid grid-cols-1 md:grid-cols-[248px_1fr] gap-5 items-start">
      <WorkspaceSidebar
        workspaceName={workspace?.name ?? "…"}
        active="/dashboard"
        workspaces={workspaces}
        currentWorkspaceId={workspace?.workspace_id}
      />

      <main className="min-w-0">
        <div className="flex justify-end items-center mb-4 gap-2">
          <ProfileMenu email={email} />
        </div>

        <section className="relative overflow-hidden rounded-2xl p-6 sm:p-8 mb-6 text-white shadow-card bg-gradient-to-br from-[#3d46c9] via-[#4a3fb8] to-[#2c33a0]">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-[#ff8259]/25 blur-3xl" />
          <p className="relative text-[12px] font-semibold uppercase tracking-widest text-white/75">
            {workspace?.name ?? "Your workspace"}
          </p>
          <h1 className="relative mt-1 text-[28px] sm:text-[32px] font-semibold font-display leading-tight">Your bots</h1>
          <p className="relative mt-1.5 max-w-xl text-[14px] text-white/85">
            {bots.length === 0
              ? "Create your first assistant, teach it from your website, and put it on your site in minutes."
              : `${bots.length} assistant${bots.length === 1 ? "" : "s"} answering your visitors. Open one to train it, check conversations or install it.`}
          </p>
          {!showForm && !loading && (
            <button
              onClick={() => setShowForm(true)}
              className="relative mt-4 inline-flex items-center gap-2 rounded-btn bg-white px-4 py-2 text-[13px] font-semibold text-[#2c33a0] shadow-card transition-all hover:brightness-95 active:scale-[0.98]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>
              New bot
            </button>
          )}
        </section>

        {loading && <p className="text-fg-muted text-sm">Loading…</p>}
        {error && <p className="text-danger text-sm bg-danger-soft rounded-lg p-3 mb-4">{error}</p>}

        {!loading && !error && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
            {bots.map((b) => (
              <a
                key={b.bot_id}
                href={`/dashboard/bots/${b.bot_id}/settings`}
                className="lift group relative overflow-hidden bg-surface border border-border rounded-2xl shadow-card p-4 pt-5 flex flex-col gap-3 hover:shadow-lg"
              >
                <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5" style={{ background: botGradient(b.name) }} />
                <button
                  onClick={(e) => deleteBot(e, b.bot_id)}
                  disabled={deletingId === b.bot_id}
                  aria-label={`Delete ${b.name}`}
                  title="Delete bot"
                  className="absolute top-2.5 right-2.5 w-6 h-6 rounded-md flex items-center justify-center text-fg-faint hover:text-danger hover:bg-danger-soft disabled:opacity-50"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
                  </svg>
                </button>
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold shadow-card flex-none"
                    style={{ background: botGradient(b.name) }}
                  >
                    {b.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[14.5px] truncate pr-5">{b.name}</div>
                    <div className="text-[11.5px] text-fg-faint">
                      Created {new Date(b.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <span className="text-[12.5px] font-semibold text-accent-ink transition-transform group-hover:translate-x-0.5">
                  Open assistant →
                </span>
              </a>
            ))}

            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="border-[1.5px] border-dashed border-border rounded-2xl min-h-[110px] flex flex-col items-center justify-center gap-2 text-fg-muted font-semibold text-[13px]"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Create a new bot
              </button>
            )}
            {showForm && (
              <form
                onSubmit={createBot}
                className="bg-surface border border-border rounded-2xl p-4 flex flex-col gap-2.5"
              >
                <label className="text-[12.5px] text-fg-muted font-medium">Bot name</label>
                <input
                  autoFocus
                  className="border border-border bg-surface-2 rounded-lg px-2.5 py-2 text-[13px]"
                  placeholder="e.g. Support Bot"
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  required
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={creating}
                    className="bg-accent text-white rounded-lg px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
                  >
                    {creating ? "Creating…" : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="border border-border rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
