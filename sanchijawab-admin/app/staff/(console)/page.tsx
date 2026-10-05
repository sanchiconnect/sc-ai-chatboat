"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { staffApi, StaffOverview, StaffWorkspaceSummary } from "@/lib/staff-api";

export default function StaffWorkspacesPage() {
  const [overview, setOverview] = useState<StaffOverview | null>(null);
  const [workspaces, setWorkspaces] = useState<StaffWorkspaceSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    staffApi.overview().then(setOverview).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      staffApi
        .listWorkspaces(search)
        .then(setWorkspaces)
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-5">
        <StatTile label="Workspaces" value={overview?.workspace_count} />
        <StatTile label="Bots" value={overview?.bot_count} />
        <StatTile label="Conversations (30d)" value={overview?.conversations_30d} />
        <StatTile label="DB storage" value={overview?.db_size} note="shared Postgres instance" />
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-card p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <div className="text-[15px] font-semibold">All workspaces</div>
            <div className="text-[12.5px] text-fg-muted">
              Every customer on the platform — support and billing access only, never edits their content
            </div>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workspace or email…"
            className="border border-border bg-surface-2 text-fg rounded-lg px-3 py-2 text-sm w-full sm:w-56"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead className="text-left">
              <tr>
                <th className="p-2.5 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Workspace</th>
                <th className="p-2.5 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Owner</th>
                <th className="p-2.5 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Bots</th>
                <th className="p-2.5 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Plan</th>
                <th className="p-2.5 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Created</th>
                <th className="p-2.5" />
              </tr>
            </thead>
            <tbody>
              {loading &&
                [0, 1, 2].map((i) => (
                  <tr key={i} className="border-t border-border animate-pulse">
                    {Array.from({ length: 6 }).map((_, c) => (
                      <td key={c} className="p-2.5">
                        <div className="h-4 rounded bg-surface-2" style={{ width: c === 0 ? "70%" : c === 5 ? "50px" : "90%" }} />
                      </td>
                    ))}
                  </tr>
                ))}
              {!loading && workspaces.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-sm text-fg-muted">No workspaces match.</td>
                </tr>
              )}
              {!loading && workspaces.map((ws) => (
                <tr key={ws.id} className="border-t border-border">
                  <td className="p-2.5 font-medium">{ws.name}</td>
                  <td className="p-2.5 text-fg-muted">{ws.owner_email}</td>
                  <td className="p-2.5 tabular">{ws.bot_count}</td>
                  <td className="p-2.5">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-surface-2 border border-border text-fg-muted">
                      {ws.plan}
                    </span>
                  </td>
                  <td className="p-2.5 text-fg-faint">{new Date(ws.created_at).toLocaleDateString()}</td>
                  <td className="p-2.5 text-right">
                    <Link
                      href={`/staff/workspaces/${ws.id}`}
                      className="text-[12.5px] font-semibold border border-border rounded-lg px-3 py-1.5 hover:bg-surface-2"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, note }: { label: string; value: string | number | undefined; note?: string }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card px-[18px] py-4 flex flex-col gap-1.5">
      <div className="text-[12px] font-semibold text-fg-muted">{label}</div>
      {value === undefined ? (
        <div className="h-[27px] flex items-center">
          <div className="h-4 w-14 rounded bg-surface-2 animate-pulse" />
        </div>
      ) : (
        <div className="font-display text-[27px] font-semibold leading-none tabular">{value}</div>
      )}
      {note && <div className="text-[11px] text-fg-faint">{note}</div>}
    </div>
  );
}
