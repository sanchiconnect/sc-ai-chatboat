"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { ProfileMenu } from "@/components/ProfileMenu";
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
        <div className="flex justify-between items-center mb-5 gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] font-semibold font-display">Your bots</h1>
            <p className="text-[13px] text-fg-muted mt-0.5">
              {bots.length} bot{bots.length === 1 ? "" : "s"}
            </p>
          </div>
          <ProfileMenu email={email} />
        </div>

        {loading && <p className="text-fg-muted text-sm">Loading…</p>}
        {error && <p className="text-danger text-sm bg-danger-soft rounded-lg p-3 mb-4">{error}</p>}

        {!loading && !error && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
            {bots.map((b) => (
              <a
                key={b.bot_id}
                href={`/dashboard/bots/${b.bot_id}/settings`}
                className="relative bg-surface border border-border rounded-2xl shadow-card p-4 flex flex-col gap-2.5 hover:border-accent"
              >
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
                  <div className="w-9 h-9 rounded-[10px] bg-accent text-white flex items-center justify-center font-bold">
                    {b.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px] truncate pr-5">{b.name}</div>
                    <div className="text-[11.5px] text-fg-faint">
                      Created {new Date(b.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
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
