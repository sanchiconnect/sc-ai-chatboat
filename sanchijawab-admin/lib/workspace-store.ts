// A user can belong to more than one workspace (invited as a teammate
// elsewhere, on top of owning their own), but there's no server-side concept
// of "current workspace" — membership is checked per-request from the URL's
// workspace_id, not from the JWT. So "which one am I looking at" is purely a
// frontend choice, persisted here across page loads.
const CURRENT_WORKSPACE_KEY = "sj_current_workspace_id";

export function getStoredWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CURRENT_WORKSPACE_KEY);
}

export function setStoredWorkspaceId(id: string) {
  localStorage.setItem(CURRENT_WORKSPACE_KEY, id);
}

// Picks the stored workspace if the user still belongs to it, otherwise
// falls back to the first one returned — and persists that choice, so a
// first-time load and a switched-then-reloaded load land on the same thing.
export function resolveWorkspace<T extends { workspace_id: string }>(list: T[]): T | null {
  if (list.length === 0) return null;
  const stored = getStoredWorkspaceId();
  const match = stored ? list.find((w) => w.workspace_id === stored) : undefined;
  const chosen = match ?? list[0];
  setStoredWorkspaceId(chosen.workspace_id);
  return chosen;
}
