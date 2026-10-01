"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { staffApi, StaffWorkspaceDetail, StaffWorkspaceBot } from "@/lib/staff-api";

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
  const [ws, setWs] = useState<StaffWorkspaceDetail | null>(null);
  const [savingBotId, setSavingBotId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [memberNotice, setMemberNotice] = useState<string | null>(null);

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

  if (!ws) return null;

  return (
    <div className="flex flex-col gap-3.5">
      <Link href="/staff" className="text-[12.5px] font-semibold text-fg-muted hover:text-fg w-fit">
        &larr; All workspaces
      </Link>

      <div className="bg-surface border border-border rounded-2xl shadow-card p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[15px] font-semibold">{ws.name}</div>
          <div className="text-[12.5px] text-fg-muted">{ws.owner_email}</div>
        </div>
        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-surface-2 border border-border text-fg-muted">
          {ws.plan}
        </span>
      </div>

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
                  <td className="p-2 text-right whitespace-nowrap">
                    {m.role !== "owner" && (
                      <div className="flex gap-3 justify-end">
                        {!m.active && (
                          <button
                            onClick={() => resendInvite(m.user_id)}
                            disabled={busy}
                            className="text-[12px] font-semibold text-accent-ink hover:underline disabled:opacity-50"
                          >
                            Resend
                          </button>
                        )}
                        <button
                          onClick={() => removeMember(m.user_id)}
                          disabled={busy}
                          className="text-[12px] font-semibold text-danger hover:underline disabled:opacity-50"
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

      <p className="text-[12px] text-fg-faint px-1">
        Support access only — staff can manage membership (role, removal, resending an invite) to help
        with an account issue, but never see conversation transcripts or bot content without the
        owner&apos;s permission.
      </p>
    </div>
  );
}
