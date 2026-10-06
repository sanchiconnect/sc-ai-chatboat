"use client";

import Link from "next/link";
import { setStoredWorkspaceId } from "@/lib/workspace-store";

const NAV = [
  {
    href: "/dashboard",
    label: "Bots",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/team",
    label: "Team",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 20a5 5 0 0 0-10 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      </svg>
    ),
  },
  {
    href: "/dashboard/billing",
    label: "Billing & plan",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64c.62-.26 1-.87 1-1.55V3a2 2 0 1 1 4 0v.09c0 .68.38 1.29 1 1.55.66.27 1.42.13 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06c-.47.45-.61 1.21-.34 1.87.26.62.87 1 1.55 1H21a2 2 0 1 1 0 4h-.09c-.68 0-1.29.38-1.55 1Z" />
      </svg>
    ),
  },
];

interface WorkspaceOption {
  workspace_id: string;
  name: string;
}

export function WorkspaceSidebar({
  workspaceName,
  active,
  workspaces,
  currentWorkspaceId,
}: {
  workspaceName: string;
  active: string;
  workspaces?: WorkspaceOption[];
  currentWorkspaceId?: string;
}) {
  const hasMultiple = (workspaces?.length ?? 0) > 1;

  function switchWorkspace(id: string) {
    setStoredWorkspaceId(id);
    window.location.reload();
  }

  return (
    <aside className="bg-surface border border-border rounded-2xl p-4 md:sticky md:top-5">
      <div className="flex items-center gap-2.5 pb-4 mb-2 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-ink text-white flex items-center justify-center font-display font-semibold flex-none">
          S
        </div>
        <div className="min-w-0 flex-1">
          {hasMultiple ? (
            <select
              value={currentWorkspaceId}
              onChange={(e) => switchWorkspace(e.target.value)}
              aria-label="Switch workspace"
              className="w-full truncate border-none bg-transparent text-sm font-semibold p-0 focus:outline-none focus:ring-0"
            >
              {workspaces!.map((w) => (
                <option key={w.workspace_id} value={w.workspace_id}>
                  {w.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-sm font-semibold truncate">{workspaceName}</div>
          )}
          <div className="text-[11.5px] text-fg-faint">
            {hasMultiple ? `${workspaces!.length} workspaces — click to switch` : "SanchiJawab workspace"}
          </div>
        </div>
      </div>
      <div className="text-[11px] uppercase tracking-wide font-semibold text-fg-faint px-2.5 pt-1 pb-1.5">
        Workspace
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium ${
              active === n.href ? "bg-accent-soft text-accent-ink" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <span className={active === n.href ? "opacity-100" : "opacity-80"}>{n.icon}</span>
            {n.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
