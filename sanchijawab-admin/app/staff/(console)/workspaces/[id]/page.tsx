"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { staffApi, StaffWorkspaceDetail, StaffWorkspaceBot, StaffWorkspaceMember, StaffApiError } from "@/lib/staff-api";

const STATUS_LABEL: Record<StaffWorkspaceBot["status"], string> = {
  live: "Live",
  pending: "Pending review",
  draft: "Draft",
  suspended: "Suspended",
};

const STATUS_PILL: Record<StaffWorkspaceBot["status"], string> = {
  live: "bg-[var(--success-soft)] text-success",
  pending: "bg-[var(--warning-soft)] text-warning",
  draft: "bg-surface-2 text-fg-faint",
  suspended: "bg-[var(--danger-soft)] text-danger",
};

export default function StaffWorkspaceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [ws, setWs] = useState<StaffWorkspaceDetail | null>(null);
  const [savingBotId, setSavingBotId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [memberNotice, setMemberNotice] = useState<string | null>(null);
  const [managingMember, setManagingMember] = useState<StaffWorkspaceMember | null>(null);
  const [wsBusy, setWsBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function load() {
    staffApi.getWorkspace(params.id).then(setWs);
  }

  useEffect(load, [params.id]);

  async function onStatusChange(botId: string, status: StaffWorkspaceBot["status"]) {
    setSavingBotId(botId);
    try {
      await staffApi.setBotStatus(botId, status);
      load();
    } finally {
      setSavingBotId(null);
    }
  }

  async function changeRole(userId: string, role: string) {
    setBusyUserId(userId);
    try {
      await staffApi.updateMemberRole(params.id, userId, role);
      load();
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeMember(userId: string) {
    if (!window.confirm("Remove this person from the workspace?")) return;
    setBusyUserId(userId);
    try {
      await staffApi.removeMember(params.id, userId);
      load();
    } finally {
      setBusyUserId(null);
    }
  }

  async function resendInvite(userId: string) {
    setBusyUserId(userId);
    setMemberNotice(null);
    try {
      const res = await staffApi.resendInvite(params.id, userId);
      setMemberNotice(res.email_sent ? "Invite resent." : "Invite refreshed, but no email was sent (SMTP not configured).");
    } finally {
      setBusyUserId(null);
    }
  }

  async function toggleWorkspaceActive() {
    if (!ws) return;
    if (ws.is_active) {
      const ok = window.confirm(
        `Deactivate "${ws.name}"? Every member loses dashboard access to it and its bots stop answering publicly, until you reactivate it. Nothing is deleted.`,
      );
      if (!ok) return;
    }
    setWsBusy(true);
    try {
      if (ws.is_active) await staffApi.deactivateWorkspace(ws.id);
      else await staffApi.reactivateWorkspace(ws.id);
      load();
    } finally {
      setWsBusy(false);
    }
  }

  async function confirmDeleteWorkspace() {
    if (!ws) return;
    setWsBusy(true);
    try {
      await staffApi.deleteWorkspace(ws.id);
      router.push("/staff");
    } finally {
      setWsBusy(false);
    }
  }

  if (!ws) {
    return (
      <div className="flex flex-col gap-3.5 animate-pulse">
        <div className="h-4 w-28 rounded bg-surface-2" />
        <div className="h-20 rounded-2xl bg-surface-2" />
        <div className="h-40 rounded-2xl bg-surface-2" />
        <div className="h-40 rounded-2xl bg-surface-2" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <Link href="/staff" className="text-[12.5px] font-semibold text-fg-muted hover:text-fg w-fit">
        &larr; All workspaces
      </Link>

      <div className="bg-surface border border-border rounded-2xl shadow-card p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold">{ws.name}</span>
            {!ws.is_active && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[var(--danger-soft)] text-danger">
                Deactivated
              </span>
            )}
          </div>
          <div className="text-[12.5px] text-fg-muted">{ws.owner_email}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-surface-2 border border-border text-fg-muted">
            {ws.plan}
          </span>
          <button
            onClick={toggleWorkspaceActive}
            disabled={wsBusy}
            className={`text-[12.5px] font-semibold rounded-lg px-3 py-1.5 border border-border disabled:opacity-50 ${
              ws.is_active ? "text-danger hover:bg-[var(--danger-soft)]" : "bg-accent text-white border-transparent"
            }`}
          >
            {ws.is_active ? "Deactivate" : "Reactivate"}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={wsBusy}
            className="text-[12.5px] font-semibold rounded-lg px-3 py-1.5 border border-danger text-danger hover:bg-[var(--danger-soft)] disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <DeleteWorkspaceConfirm
          workspaceName={ws.name}
          busy={wsBusy}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={confirmDeleteWorkspace}
        />
      )}

      <div className="bg-surface border border-border rounded-2xl shadow-card p-5">
        <div className="text-[15px] font-semibold mb-3">Bots ({ws.bots.length})</div>
        <div className="flex flex-col divide-y divide-border">
          {ws.bots.map((bot) => (
            <div key={bot.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium truncate">{bot.name}</div>
                <div className="text-[12px] text-fg-faint tabular">{bot.conversations_30d} conversations (30d)</div>
              </div>
              <select
                value={bot.status}
                disabled={savingBotId === bot.id}
                onChange={(e) => onStatusChange(bot.id, e.target.value as StaffWorkspaceBot["status"])}
                className={`text-[12px] font-semibold border border-border rounded-lg px-2 py-1.5 bg-surface-2 ${STATUS_PILL[bot.status]}`}
              >
                {(Object.keys(STATUS_LABEL) as StaffWorkspaceBot["status"][]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-fg-faint pt-3 mt-1 border-t border-border">
          Changing status here is a support/moderation action (e.g. suspending a bot that violates
          policy) — it doesn&apos;t touch the bot&apos;s content or settings.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[15px] font-semibold">Members</div>
          {memberNotice && <span className="text-[12px] text-success">{memberNotice}</span>}
        </div>
        <table className="w-full text-[13px] border-collapse">
          <thead className="text-left">
            <tr>
              <th className="p-2 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Name</th>
              <th className="p-2 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Email</th>
              <th className="p-2 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Role</th>
              <th className="p-2 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Status</th>
              <th className="p-2 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Account</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {ws.members.map((m) => {
              const busy = busyUserId === m.user_id;
              return (
                <tr key={m.user_id} className="border-t border-border">
                  <td className="p-2 capitalize">{m.name}</td>
                  <td className="p-2 text-fg-muted">{m.email}</td>
                  <td className="p-2 capitalize">
                    {m.role === "owner" ? (
                      "Owner"
                    ) : (
                      <select
                        value={m.role}
                        disabled={busy}
                        onChange={(e) => changeRole(m.user_id, e.target.value)}
                        className="border border-border bg-surface-2 rounded-lg px-2 py-1 text-[12px] disabled:opacity-50"
                      >
                        <option value="admin">Admin</option>
                        <option value="agent">Agent</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    )}
                  </td>
                  <td className="p-2">
                    <span
                      className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        m.active ? "bg-[var(--success-soft)] text-success" : "bg-[var(--warning-soft)] text-warning"
                      }`}
                    >
                      {m.active ? "Active" : "Pending"}
                    </span>
                  </td>
                  <td className="p-2">
                    <span
                      className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        m.account_active ? "bg-surface-2 text-fg-faint" : "bg-[var(--danger-soft)] text-danger"
                      }`}
                    >
                      {m.account_active ? "Enabled" : "Deactivated"}
                    </span>
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <div className="flex gap-3 justify-end">
                      {m.role !== "owner" && !m.active && (
                        <button
                          onClick={() => resendInvite(m.user_id)}
                          disabled={busy}
                          className="text-[12px] font-semibold text-accent-ink hover:underline disabled:opacity-50"
                        >
                          Resend
                        </button>
                      )}
                      <button
                        onClick={() => setManagingMember(m)}
                        disabled={busy}
                        className="text-[12px] font-semibold text-fg-muted hover:text-fg disabled:opacity-50"
                      >
                        Manage
                      </button>
                      {m.role !== "owner" && (
                        <button
                          onClick={() => removeMember(m.user_id)}
                          disabled={busy}
                          className="text-[12px] font-semibold text-danger hover:underline disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-fg-faint px-1">
        Support access only — staff can manage membership and accounts (role, removal, email, password,
        deactivation) to help with an account issue, but never see conversation transcripts or bot
        content without the owner&apos;s permission.
      </p>

      {managingMember && (
        <ManageAccountModal member={managingMember} onClose={() => setManagingMember(null)} onChanged={load} />
      )}
    </div>
  );
}

function ManageAccountModal({
  member,
  onClose,
  onChanged,
}: {
  member: StaffWorkspaceMember;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState(member.email);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [accountActive, setAccountActive] = useState(member.account_active);

  async function saveEmail() {
    setBusy(true);
    setNotice(null);
    try {
      await staffApi.updateUserEmail(member.user_id, email);
      setNotice({ kind: "success", text: "Email updated." });
      onChanged();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof StaffApiError ? err.message : "Failed to update email" });
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (newPassword.length < 8) {
      setNotice({ kind: "error", text: "New password must be at least 8 characters" });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await staffApi.resetUserPassword(member.user_id, newPassword);
      setNotice({
        kind: "success",
        text: res.email_sent ? "Password reset — the user was emailed." : "Password reset (no email sent — SMTP not configured).",
      });
      setNewPassword("");
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof StaffApiError ? err.message : "Failed to reset password" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (accountActive && member.role === "owner") {
      const ok = window.confirm(
        "This person owns this workspace — deactivating them locks everyone in it out of any owner-only actions, with no one else able to take over. Deactivate anyway?",
      );
      if (!ok) return;
    }
    setBusy(true);
    setNotice(null);
    try {
      if (accountActive) {
        await staffApi.deactivateUser(member.user_id);
        setAccountActive(false);
        setNotice({ kind: "success", text: "Account deactivated — this user can no longer log in." });
      } else {
        await staffApi.reactivateUser(member.user_id);
        setAccountActive(true);
        setNotice({ kind: "success", text: "Account reactivated." });
      }
      onChanged();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof StaffApiError ? err.message : "Failed to update account status" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div
        className="bg-surface border border-border rounded-2xl shadow-card p-5 w-full max-w-md space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="font-display text-[16px] font-semibold">Manage account</h3>
          <p className="text-[12.5px] text-fg-muted mt-0.5">{member.email}</p>
        </div>

        {notice && (
          <div
            className={`text-[12.5px] rounded-lg p-2.5 ${
              notice.kind === "success" ? "text-success bg-[var(--success-soft)]" : "text-danger bg-[var(--danger-soft)]"
            }`}
          >
            {notice.text}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[12px] font-semibold text-fg-muted">Email address</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px] disabled:opacity-50"
            />
            <button
              onClick={saveEmail}
              disabled={busy || email === member.email}
              className="shrink-0 bg-accent text-white rounded-lg px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[12px] font-semibold text-fg-muted">Reset password</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="New password (min 8 characters)"
              value={newPassword}
              disabled={busy}
              onChange={(e) => setNewPassword(e.target.value)}
              className="flex-1 border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px] disabled:opacity-50"
            />
            <button
              onClick={resetPassword}
              disabled={busy || !newPassword}
              className="shrink-0 bg-accent text-white rounded-lg px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50"
            >
              Reset
            </button>
          </div>
          <p className="text-[11px] text-fg-faint">The user is emailed a notice that support reset their password.</p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div>
            <p className="text-[13px] font-medium text-fg">{accountActive ? "Account enabled" : "Account deactivated"}</p>
            <p className="text-[11.5px] text-fg-faint">
              {accountActive ? "This user can log in normally." : "This user can't log in anywhere until reactivated."}
            </p>
          </div>
          <button
            onClick={toggleActive}
            disabled={busy}
            title={member.role === "owner" && accountActive ? "This person owns the workspace — you'll be asked to confirm" : undefined}
            className={`shrink-0 rounded-lg px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50 ${
              accountActive ? "text-danger border border-border hover:bg-[var(--danger-soft)]" : "bg-accent text-white"
            }`}
          >
            {accountActive ? "Deactivate" : "Reactivate"}
          </button>
        </div>

        <button
          onClick={onClose}
          disabled={busy}
          className="w-full text-center text-[12.5px] font-semibold text-fg-muted hover:text-fg pt-1"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function DeleteWorkspaceConfirm({
  workspaceName,
  busy,
  onCancel,
  onConfirm,
}: {
  workspaceName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed === workspaceName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onCancel()}>
      <div
        className="bg-surface border border-danger rounded-2xl shadow-card p-5 w-full max-w-md space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-[16px] font-semibold text-danger">Delete workspace permanently</h3>
        <p className="text-[13px] text-fg-muted leading-relaxed">
          This removes <strong>{workspaceName}</strong> and everything in it — every bot, conversation, lead,
          and knowledge source — for good. There is no undo. Anyone whose only workspace this is will also lose
          their account.
        </p>
        <div>
          <label className="text-[12px] font-semibold text-fg-muted">
            Type <span className="font-mono text-fg">{workspaceName}</span> to confirm
          </label>
          <input
            value={typed}
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1 w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px] disabled:opacity-50"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onConfirm}
            disabled={busy || !matches}
            className="flex-1 bg-danger text-white rounded-lg py-2 text-[13px] font-semibold disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 border border-border rounded-lg py-2 text-[13px] font-semibold text-fg-muted hover:bg-surface-2 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
