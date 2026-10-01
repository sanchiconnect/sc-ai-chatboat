"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { ProfileMenu } from "@/components/ProfileMenu";

type Member = { user_id: string; email: string; role: string; active: boolean };

export default function TeamPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("…");
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(wsId: string) {
    try {
      setMembers(await api.listMembers(wsId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.me().then((m) => setEmail(m.email)).catch(() => {});
    api.listWorkspaces().then((list) => {
      const ws = list[0];
      if (!ws) return;
      setWorkspaceId(ws.workspace_id);
      setWorkspaceName(ws.name);
      load(ws.workspace_id);
    });
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !inviteEmail.trim()) return;
    setInviting(true);
    setNotice(null);
    setError(null);
    try {
      const res = await api.inviteMember(workspaceId, inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      setNotice(
        res.email_sent
          ? "Invite email sent."
          : "Invite created, but no email was sent (SMTP not configured) — the invite link would normally go out by email.",
      );
      await load(workspaceId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send invite");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="max-w-[1240px] mx-auto grid grid-cols-1 md:grid-cols-[248px_1fr] gap-5 items-start">
      <WorkspaceSidebar workspaceName={workspaceName} active="/dashboard/team" />

      <main className="min-w-0">
        <div className="flex justify-between items-center mb-5 gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] font-semibold font-display">Team</h1>
            <p className="text-[13px] text-fg-muted mt-0.5">Who can access this workspace</p>
          </div>
          <ProfileMenu email={email} />
        </div>

        <form onSubmit={invite} className="bg-surface border border-border rounded-2xl shadow-card p-4 mb-4 flex gap-2 flex-wrap">
          <input
            type="email"
            required
            placeholder="teammate@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 min-w-[200px] border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="border border-border bg-surface-2 rounded-lg px-2 py-2 text-[13px]"
          >
            <option value="admin">Admin</option>
            <option value="agent">Agent</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            type="submit"
            disabled={inviting}
            className="bg-accent text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
          >
            {inviting ? "Inviting…" : "Invite teammate"}
          </button>
        </form>

        {notice && <div className="text-[13px] text-accent-ink bg-accent-soft rounded-lg p-3 mb-4">{notice}</div>}
        {error && <div className="text-[13px] text-danger bg-danger-soft rounded-lg p-3 mb-4">{error}</div>}

        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          {loading && <p className="text-fg-muted text-sm p-4">Loading…</p>}
          {!loading && (
            <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead className="bg-surface-2 text-left">
                <tr>
                  <th className="p-2.5 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Email</th>
                  <th className="p-2.5 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Role</th>
                  <th className="p-2.5 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id} className="border-t border-border">
                    <td className="p-2.5">{m.email}</td>
                    <td className="p-2.5 capitalize">{m.role}</td>
                    <td className="p-2.5">
                      <span
                        className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          m.active ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
                        }`}
                      >
                        {m.active ? "Active" : "Invite pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
