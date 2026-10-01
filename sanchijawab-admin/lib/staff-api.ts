// Separate token namespace from lib/api.ts on purpose: a staff (super admin)
// session and a customer session can coexist in the same browser without
// either one silently overwriting or being sent to the other's routes.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const STAFF_TOKEN_KEY = "sanchijawab_staff_token";

export function getStaffToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STAFF_TOKEN_KEY);
}

export function setStaffToken(token: string) {
  localStorage.setItem(STAFF_TOKEN_KEY, token);
}

export function clearStaffToken() {
  localStorage.removeItem(STAFF_TOKEN_KEY);
}

export class StaffApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStaffToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new StaffApiError(resp.status, body.detail || `Request failed (${resp.status})`);
  }
  return resp.json();
}

export interface StaffOverview {
  workspace_count: number;
  bot_count: number;
  conversations_30d: number;
  db_size: string;
}

export interface StaffWorkspaceSummary {
  id: string;
  name: string;
  owner_email: string;
  bot_count: number;
  plan: string;
  created_at: string;
}

export interface StaffWorkspaceBot {
  id: string;
  name: string;
  status: "live" | "pending" | "draft" | "suspended";
  conversations_30d: number;
}

export interface StaffWorkspaceMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

export interface StaffWorkspaceDetail {
  id: string;
  name: string;
  owner_email: string;
  plan: string;
  created_at: string;
  bots: StaffWorkspaceBot[];
  members: StaffWorkspaceMember[];
}

export const staffApi = {
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/v1/staff/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ email: string }>("/v1/staff/me"),

  overview: () => request<StaffOverview>("/v1/staff/overview"),

  listWorkspaces: (q: string = "") =>
    request<StaffWorkspaceSummary[]>(`/v1/staff/workspaces${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  getWorkspace: (id: string) => request<StaffWorkspaceDetail>(`/v1/staff/workspaces/${id}`),

  setBotStatus: (botId: string, status: StaffWorkspaceBot["status"]) =>
    request<{ id: string; status: string }>(`/v1/staff/bots/${botId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  resendInvite: (workspaceId: string, userId: string) =>
    request<{ email_sent: boolean }>(`/v1/staff/workspaces/${workspaceId}/members/${userId}/resend-invite`, {
      method: "POST",
    }),

  updateMemberRole: (workspaceId: string, userId: string, role: string) =>
    request<{ user_id: string; role: string }>(`/v1/staff/workspaces/${workspaceId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),

  removeMember: (workspaceId: string, userId: string) =>
    request<{ removed: boolean }>(`/v1/staff/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" }),
};
