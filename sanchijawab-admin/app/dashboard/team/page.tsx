"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { ProfileMenu } from "@/components/ProfileMenu";
import { resolveWorkspace } from "@/lib/workspace-store";
import { pingNotifications, useLive } from "@/lib/use-live";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", agent: "Agent", viewer: "Viewer" };

type Member = { user_id: string; email: string; role: string; active: boolean };
type WorkspaceOption = { workspace_id: string; name: string; role: string };

export default function TeamPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("…");
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  // Only owners and admins manage the team; everyone else just sees who is in it.
  const canManage = myRole === "owner" || myRole === "admin";

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
      setWorkspaces(list);
      const ws = resolveWorkspace(list);
      if (!ws) return;
      setWorkspaceId(ws.workspace_id);
      setWorkspaceName(ws.name);
      setMyRole(ws.role);
      load(ws.workspace_id);
    });
  }, []);

  // Invites accepted, roles changed or people removed by someone else show up on their own.
  useLive(() => {
    if (workspaceId) api.listMembers(workspaceId).then(setMembers).catch(() => {});
    api.listWorkspaces().then((list) => {
      const ws = resolveWorkspace(list);
      if (ws) setMyRole(ws.role);
    }).catch(() => {});
  }, 8_000, [workspaceId]);

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
      pingNotifications();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send invite");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(userId: string, role: string) {
    if (!workspaceId) return;
    setBusyUserId(userId);
    setError(null);
    try {
      await api.updateMemberRole(workspaceId, userId, role);
      await load(workspaceId);
      pingNotifications();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change role");
    } finally {
      setBusyUserId(null);
    }
  }

  async function remove(userId: string) {
    if (!workspaceId) return;
    setBusyUserId(userId);
    setError(null);
    try {
      await api.removeMember(workspaceId, userId);
      await load(workspaceId);
      pingNotifications();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove member");
    } finally {
      setBusyUserId(null);
    }
  }

  async function resend(userId: string) {
    if (!workspaceId) return;
    setBusyUserId(userId);
    setNotice(null);
    setError(null);
    try {
      const res = await api.resendInvite(workspaceId, userId);
      setNotice(res.email_sent ? "Invite resent." : "Invite refreshed, but no email was sent (SMTP not configured).");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to resend invite");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="max-w-[1240px] mx-auto grid grid-cols-1 md:grid-cols-[248px_1fr] gap-5 items-start">
      <WorkspaceSidebar
        workspaceName={workspaceName}
        active="/dashboard/team"
        workspaces={workspaces}
        currentWorkspaceId={workspaceId ?? undefined}
      />

      <main className="min-w-0">
        <div className="flex justify-between items-center mb-5 gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] font-semibold font-display">Team</h1>
            <p className="text-[13px] text-fg-muted mt-0.5">Who can access this workspace</p>
          </div>
          <ProfileMenu email={email} />
        </div>

        {myRole && !canManage && (
          <div className="mb-4 rounded-2xl border border-border bg-surface px-4 py-3 text-[13px] text-fg-muted shadow-card">
            You&apos;re {myRole === "agent" ? "an" : "a"} <strong className="text-fg">{ROLE_LABEL[myRole] ?? myRole}</strong> in this workspace.
            Only owners and admins can invite people, change roles or remove teammates.
          </div>
        )}

        {canManage && (
        <form onSubmit={invite} className="bg-surface border border-border rounded-2xl shadow-card p-4 mb-4">
          <fieldset disabled={inviting} className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
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
            aria-label="Role for invited teammate"
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
          </fieldset>
        </form>
        )}

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
                  <th className="p-2.5" />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const busy = busyUserId === m.user_id;
                  return (
                    <tr key={m.user_id} className="border-t border-border">
                      <td className="p-2.5">
                        {m.email}
                        {m.email === email && <span className="ml-1.5 text-[11px] text-fg-faint">(you)</span>}
                      </td>
                      <td className="p-2.5">
                        {m.role === "owner" || !canManage ? (
                          ROLE_LABEL[m.role] ?? m.role
                        ) : (
                          <select
                            value={m.role}
                            disabled={busy}
                            onChange={(e) => changeRole(m.user_id, e.target.value)}
                            aria-label={`Role for ${m.email}`}
                            className="border border-border bg-surface-2 rounded-lg px-2 py-1 text-[12.5px] disabled:opacity-50"
                          >
                            <option value="admin">Admin</option>
                            <option value="agent">Agent</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        )}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            m.active ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
                          }`}
                        >
                          {m.active ? "Active" : "Invite pending"}
                        </span>
                      </td>
                      <td className="p-2.5 text-right whitespace-nowrap">
                        {canManage && m.role !== "owner" && (
                          <div className="flex gap-3 justify-end">
                            {!m.active && (
                              <button
                                onClick={() => resend(m.user_id)}
                                disabled={busy}
                                className="text-[12.5px] font-semibold text-accent-ink hover:underline disabled:opacity-50"
                              >
                                Resend
                              </button>
                            )}
                            <button
                              onClick={() => remove(m.user_id)}
                              disabled={busy}
                              className="text-[12.5px] font-semibold text-danger hover:underline disabled:opacity-50"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
