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

export interface StaffSetting {
  key: string; label: string; help: string; value: string; is_default: boolean;
}

export interface StaffAuditEntry {
  id: string; actor_email: string; method: string; path: string; status_code: number; ip: string; created_at: string;
}

export interface StaffContentInput {
  title: string; excerpt: string; body: string; read_minutes: number; published: boolean; date: string;
}

export interface StaffContentItem extends StaffContentInput {
  kind: string; slug: string; updated_at: string; updated_by: string;
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
  is_active: boolean;
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
  account_active: boolean;
}

export interface StaffWorkspaceDetail {
  id: string;
  name: string;
  owner_email: string;
  plan: string;
  created_at: string;
  is_active: boolean;
  bots: StaffWorkspaceBot[];
  members: StaffWorkspaceMember[];
}

export interface StaffPlan {
  plan_id: string; name: string; price_text: string; tagline: string; features: string[];
  is_active: boolean; sort_order: number; amount: number | null; currency: string; purchasable: boolean;
  limits: Record<string, number | null>;
}

export type StaffPlanInput = Partial<{
  name: string; price_text: string; tagline: string; features: string[]; is_active: boolean;
  sort_order: number; amount: number | null; clear_amount: boolean; currency: string;
  limits: Record<string, number | null>;
}>;

export interface StaffGateway {
  code: string; name: string; is_primary: boolean; enabled: boolean;
  test_client_id: string; test_configured: boolean; live_client_id: string; live_configured: boolean;
}

export interface StaffBillingProfile {
  supplier_name: string; supplier_gstin: string; supplier_address: string; supplier_city: string;
  supplier_state: string; supplier_country: string; supplier_pincode: string; supplier_email: string; supplier_phone: string;
}

export const staffApi = {
  listPlans: () => request<StaffPlan[]>("/v1/plans"),

  createPlan: (body: StaffPlanInput & { name: string }) =>
    request<StaffPlan>("/v1/plans", { method: "POST", body: JSON.stringify(body) }),

  updatePlan: (planId: string, body: StaffPlanInput) =>
    request<StaffPlan>(`/v1/plans/${planId}`, { method: "PATCH", body: JSON.stringify(body) }),

  deletePlan: (planId: string) => request<{ deleted: boolean }>(`/v1/plans/${planId}`, { method: "DELETE" }),

  listGateways: () => request<StaffGateway[]>("/v1/billing/gateways"),

  updateGateway: (
    code: string,
    body: Partial<{ test_client_id: string; test_client_secret: string; live_client_id: string; live_client_secret: string; is_primary: boolean; enabled: boolean }>,
  ) => request<StaffGateway>(`/v1/billing/gateways/${code}`, { method: "PUT", body: JSON.stringify(body) }),

  getBillingProfile: () => request<StaffBillingProfile>("/v1/billing/profile"),

  updateBillingProfile: (body: StaffBillingProfile) =>
    request<StaffBillingProfile>("/v1/billing/profile", { method: "PUT", body: JSON.stringify(body) }),

  login: (email: string, password: string) =>
    request<{ access_token: string }>("/v1/staff/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ email: string }>("/v1/staff/me"),

  getSettings: () => request<StaffSetting[]>("/v1/staff/settings"),

  putSetting: (key: string, value: string) =>
    request<StaffSetting[]>(`/v1/staff/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) }),

  auditLog: (limit = 100, offset = 0) =>
    request<StaffAuditEntry[]>(`/v1/staff/audit-log?limit=${limit}&offset=${offset}`),

  // The CSV needs the staff token in a header, which a plain link can't send,
  // so fetch it and hand the browser a blob to save.
  downloadAuditLog: async (days: number) => {
    const resp = await fetch(`${API_URL}/v1/staff/audit-log/export?days=${days}`, {
      headers: { Authorization: `Bearer ${getStaffToken() ?? ""}` },
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new StaffApiError(resp.status, body.detail || `Download failed (${resp.status})`);
    }
    const url = URL.createObjectURL(await resp.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-last-${days}-days.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  listContent: () => request<StaffContentItem[]>("/v1/content"),

  saveContent: (kind: string, slug: string, body: StaffContentInput) =>
    request<StaffContentItem>(`/v1/content/${kind}/${slug}`, { method: "PUT", body: JSON.stringify(body) }),

  deleteContent: (kind: string, slug: string) =>
    request<{ deleted: boolean }>(`/v1/content/${kind}/${slug}`, { method: "DELETE" }),

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

  updateUserEmail: (userId: string, email: string) =>
    request<{ user_id: string; email: string }>(`/v1/staff/users/${userId}/email`, {
      method: "PATCH",
      body: JSON.stringify({ email }),
    }),

  resetUserPassword: (userId: string, newPassword: string) =>
    request<{ user_id: string; email_sent: boolean }>(`/v1/staff/users/${userId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ new_password: newPassword }),
    }),

  deactivateUser: (userId: string) =>
    request<{ user_id: string; is_active: boolean }>(`/v1/staff/users/${userId}/deactivate`, { method: "POST" }),

  reactivateUser: (userId: string) =>
    request<{ user_id: string; is_active: boolean }>(`/v1/staff/users/${userId}/reactivate`, { method: "POST" }),

  deactivateWorkspace: (workspaceId: string) =>
    request<{ workspace_id: string; is_active: boolean }>(`/v1/staff/workspaces/${workspaceId}/deactivate`, {
      method: "POST",
    }),

  reactivateWorkspace: (workspaceId: string) =>
    request<{ workspace_id: string; is_active: boolean }>(`/v1/staff/workspaces/${workspaceId}/reactivate`, {
      method: "POST",
    }),

  deleteWorkspace: (workspaceId: string) =>
    request<{ deleted: boolean }>(`/v1/staff/workspaces/${workspaceId}`, { method: "DELETE" }),
};
