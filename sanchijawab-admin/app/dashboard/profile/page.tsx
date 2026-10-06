"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { ProfileMenu } from "@/components/ProfileMenu";
import { PasswordInput } from "@/components/PasswordInput";
import { resolveWorkspace } from "@/lib/workspace-store";

export default function ProfilePage() {
  const [workspaceName, setWorkspaceName] = useState("…");
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined);
  const [workspaces, setWorkspaces] = useState<{ workspace_id: string; name: string }[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.me().then((m) => {
      setEmail(m.email);
      setIsSuperAdmin(m.is_super_admin);
    }).catch(() => {});
    api.listWorkspaces().then((list) => {
      setWorkspaces(list);
      const ws = resolveWorkspace(list);
      if (ws) {
        setWorkspaceName(ws.name);
        setWorkspaceId(ws.workspace_id);
      }
    });
  }, []);

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
            <span className="text-[13px] font-medium">{isSuperAdmin ? "Super admin" : "Member"}</span>
          </div>
        </div>

        <form onSubmit={submitPasswordChange} className="bg-surface border border-border rounded-2xl shadow-card p-5 max-w-lg space-y-3">
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
        </form>
      </main>
    </div>
  );
}
