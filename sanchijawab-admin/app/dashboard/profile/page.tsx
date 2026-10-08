"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { ProfileMenu } from "@/components/ProfileMenu";
import { PasswordInput } from "@/components/PasswordInput";
import { resolveWorkspace } from "@/lib/workspace-store";
import { useLive } from "@/lib/use-live";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", agent: "Agent", viewer: "Viewer" };

export default function ProfilePage() {
  const [workspaceName, setWorkspaceName] = useState("…");
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined);
  const [workspaces, setWorkspaces] = useState<{ workspace_id: string; name: string }[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  // If an admin changes this person's role, it updates here without a refresh.
  useLive(() => {
    api.listWorkspaces().then((list) => {
      const ws = resolveWorkspace(list);
      if (ws) setRole(ws.role);
    }).catch(() => {});
  }, 10_000);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [emailNotifications, setEmailNotifications] = useState(true);
  const [savingPref, setSavingPref] = useState(false);

  useEffect(() => {
    api.me().then(async (m) => {
      setEmail(m.email);
      setIsSuperAdmin(m.is_super_admin);

      const list = await api.listWorkspaces();
      setWorkspaces(list);
      const ws = resolveWorkspace(list);
      if (!ws) return;
      setWorkspaceName(ws.name);
      setWorkspaceId(ws.workspace_id);
      setRole(ws.role);

      const members = await api.listMembers(ws.workspace_id).catch(() => []);
      const mine = members.find((member) => member.email === m.email);
      if (mine) setEmailNotifications(mine.email_notifications);
    }).catch(() => {});
  }, []);

  async function togglePreference(checked: boolean) {
    if (!workspaceId) return;
    setEmailNotifications(checked);
    setSavingPref(true);
    try {
      await api.updateNotificationPreferences(workspaceId, checked);
    } catch (err) {
      setEmailNotifications(!checked);
      setError(err instanceof ApiError ? err.message : "Failed to save preference");
    } finally {
      setSavingPref(false);
    }
  }

  async function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setNotice("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-[1240px] mx-auto grid grid-cols-1 md:grid-cols-[248px_1fr] gap-5 items-start">
      <WorkspaceSidebar
        workspaceName={workspaceName}
        active="/dashboard/profile"
        workspaces={workspaces}
        currentWorkspaceId={workspaceId}
      />

      <main className="min-w-0">
        <div className="flex justify-between items-center mb-5 gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] font-semibold font-display">Profile</h1>
            <p className="text-[13px] text-fg-muted mt-0.5">Your account details</p>
          </div>
          <ProfileMenu email={email} />
        </div>

        <div className="bg-surface border border-border rounded-2xl shadow-card p-5 max-w-lg mb-5">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-[13px] text-fg-muted">Email</span>
            <span className="text-[13px] font-medium">{email ?? "…"}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-[13px] text-fg-muted">Role</span>
            <span className="text-[13px] font-medium">
              {role ? ROLE_LABEL[role] ?? role : "…"}
              {isSuperAdmin && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink">Platform super admin</span>}
            </span>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl shadow-card p-5 max-w-lg mb-5">
          <h3 className="font-display text-[16px] font-semibold mb-1">Notifications</h3>
          <p className="text-[12.5px] text-fg-muted mb-3">
            In-app notifications always show when a bot needs a human. This only controls whether you also get an
            email for it.
          </p>
          <label className="flex items-center justify-between py-1 cursor-pointer">
            <span className="text-[13px]">Email me when a conversation needs a human</span>
            <input
              type="checkbox"
              checked={emailNotifications}
              disabled={savingPref || !workspaceId}
              onChange={(e) => togglePreference(e.target.checked)}
            />
          </label>
        </div>

        <form onSubmit={submitPasswordChange} className="bg-surface border border-border rounded-2xl shadow-card p-5 max-w-lg">
          <fieldset disabled={saving} className="m-0 min-w-0 space-y-3 border-0 p-0">
          <h3 className="font-display text-[16px] font-semibold">Change password</h3>
          {error && <div className="text-[13px] text-danger bg-danger-soft rounded-lg p-3">{error}</div>}
          {notice && <div className="text-[13px] text-success bg-success-soft rounded-lg p-3">{notice}</div>}
          <div>
            <label htmlFor="profile-current-password" className="text-[12.5px] font-medium">Current password</label>
            <input
              id="profile-current-password"
              type="password"
              required
              className="mt-1 w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="profile-new-password" className="text-[12.5px] font-medium">New password</label>
            <PasswordInput
              id="profile-new-password"
              value={newPassword}
              onChange={setNewPassword}
              required
              minLength={8}
              autoComplete="new-password"
              allowGenerate
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
          >
            {saving ? "Saving…" : "Update password"}
          </button>
          </fieldset>
        </form>
      </main>
    </div>
  );
}
