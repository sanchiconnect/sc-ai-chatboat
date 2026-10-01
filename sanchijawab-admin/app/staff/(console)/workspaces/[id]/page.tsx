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
        <div className="text-[15px] font-semibold mb-3">Members</div>
        <table className="w-full text-[13px] border-collapse">
          <thead className="text-left">
            <tr>
              <th className="p-2 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Name</th>
              <th className="p-2 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Email</th>
              <th className="p-2 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Role</th>
            </tr>
          </thead>
          <tbody>
            {ws.members.map((m) => (
              <tr key={m.email} className="border-t border-border">
                <td className="p-2 capitalize">{m.name}</td>
                <td className="p-2 text-fg-muted">{m.email}</td>
                <td className="p-2 capitalize">{m.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-fg-faint px-1">
        Support access only — staff can see usage figures and the team roster here to help debug or
        answer a billing question. They never see conversation transcripts or bot content without the
        owner&apos;s permission.
      </p>
    </div>
  );
}
