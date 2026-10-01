const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_KEY = "sanchijawab_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new ApiError(resp.status, body.detail || `Request failed (${resp.status})`);
  }
  return resp.json();
}

export interface SignupResponse {
  access_token: string;
  workspace_id: string;
  email_sent: boolean;
  email_verify_token: string;
}

export const api = {
  signup: (email: string, password: string, businessName: string) =>
    request<SignupResponse>("/v1/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, business_name: businessName }),
    }),

  login: (email: string, password: string) =>
    request<{ access_token: string }>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  verifyEmail: (token: string) =>
    request<{ verified: boolean }>("/v1/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  acceptInvite: (token: string, password: string) =>
    request<{ access_token: string; workspace_id: string }>("/v1/auth/accept-invite", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),

  me: () =>
    request<{ user_id: string; tenant_id: string; email: string | null; is_super_admin: boolean }>("/v1/auth/me"),

  listWorkspaces: () =>
    request<{ workspace_id: string; name: string; role: string }[]>("/v1/workspaces"),

  updateWorkspace: (workspaceId: string, name: string) =>
    request<{ workspace_id: string; name: string }>(`/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ changed: boolean }>("/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),

  listMembers: (workspaceId: string) =>
    request<{ user_id: string; email: string; role: string; active: boolean }[]>(
      `/v1/workspaces/${workspaceId}/members`,
    ),

  inviteMember: (workspaceId: string, email: string, role: string) =>
    request<{ user_id: string; role: string; email_sent: boolean; invite_token: string | null }>(
      `/v1/workspaces/${workspaceId}/invitations`,
      { method: "POST", body: JSON.stringify({ email, role }) },
    ),

  resendInvite: (workspaceId: string, userId: string) =>
    request<{ email_sent: boolean; invite_token: string | null }>(
      `/v1/workspaces/${workspaceId}/members/${userId}/resend-invite`,
      { method: "POST" },
    ),

  updateMemberRole: (workspaceId: string, userId: string, role: string) =>
    request<{ user_id: string; role: string }>(`/v1/workspaces/${workspaceId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),

  removeMember: (workspaceId: string, userId: string) =>
    request<{ removed: boolean }>(`/v1/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" }),

  createBot: (workspaceId: string, name: string) =>
    request<{ bot_id: string }>(`/v1/workspaces/${workspaceId}/bots`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  listBots: (workspaceId: string) =>
    request<{ bot_id: string; name: string; created_at: string }[]>(`/v1/workspaces/${workspaceId}/bots`),

  deleteBot: (botId: string) => request<{ deleted: boolean }>(`/v1/bots/${botId}`, { method: "DELETE" }),

  createSource: (botId: string, url: string, visibility: "customer" | "internal" = "customer") =>
    request<{ source_id: string; job_id: number; status: string }>("/v1/sources", {
      method: "POST",
      body: JSON.stringify({ bot_id: botId, url, visibility }),
    }),

  sourceStatus: (jobId: number) =>
    request<{ job_id: number; status: string; error: string | null }>(`/v1/sources/${jobId}/status`),

  listSources: (botId: string) =>
    request<
      { source_id: string; url: string; visibility: string; job_status: string | null; job_error: string | null }[]
    >(`/v1/bots/${botId}/sources`),

  deleteSource: (sourceId: string) =>
    request<{ deleted: boolean }>(`/v1/sources/${sourceId}`, { method: "DELETE" }),

  getBot: (botId: string) =>
    request<{
      bot_id: string; name: string; persona: string; instructions: string;
      model_tier: string; allowed_domains: string[]; avatar_id: string; avatar_name: string;
      crm_webhook_url: string;
    }>(`/v1/bots/${botId}`),

  updateBot: (
    botId: string,
    body: Partial<{
      name: string; persona: string; instructions: string; model_tier: string; allowed_domains: string[];
      avatar_id: string; avatar_name: string; crm_webhook_url: string;
    }>,
  ) =>
    request<{
      bot_id: string; name: string; persona: string; instructions: string;
      model_tier: string; allowed_domains: string[]; avatar_id: string; avatar_name: string;
      crm_webhook_url: string;
    }>(`/v1/bots/${botId}`, { method: "PATCH", body: JSON.stringify(body) }),

  getWidgetConfig: (botId: string) =>
    request<{
      primary_color: string; theme: string; position: string;
      texts: { welcome?: string; header?: string };
      consent_text: string; require_consent: boolean;
    }>(`/v1/bots/${botId}/widget-config`),

  updateWidgetConfig: (
    botId: string,
    body: Partial<{
      primary_color: string; theme: string; position: string; welcome: string; header: string;
      consent_text: string; require_consent: boolean;
    }>,
  ) =>
    request<{
      primary_color: string; theme: string; position: string; texts: Record<string, string>;
      consent_text: string; require_consent: boolean;
    }>(`/v1/bots/${botId}/widget-config`, { method: "PUT", body: JSON.stringify(body) }),

  listConversations: (botId: string, status?: string) =>
    request<
      { conversation_id: string; status: string; visitor_id: string; page_url: string; started_at: string; last_message: string | null }[]
    >(`/v1/bots/${botId}/conversations${status ? `?status=${status}` : ""}`),

  getConversation: (conversationId: string) =>
    request<{
      conversation_id: string; status: string; visitor_id: string; page_url: string; started_at: string;
      messages: { id: string; role: string; content: string; created_at: string }[];
      leads: { name: string; email: string; phone: string }[];
    }>(`/v1/conversations/${conversationId}`),

  replyConversation: (conversationId: string, message: string) =>
    request<{ id: string; role: string; content: string; created_at: string }>(
      `/v1/conversations/${conversationId}/reply`,
      { method: "POST", body: JSON.stringify({ message }) },
    ),

  closeConversation: (conversationId: string) =>
    request<{ conversation_id: string; status: string }>(`/v1/conversations/${conversationId}/close`, { method: "POST" }),

  getAnalyticsSummary: (botId: string, days = 30) =>
    request<{
      days: number; total_conversations: number; total_messages: number; handoff_count: number;
      resolution_rate: number | null; leads_count: number; message_satisfaction_rate: number | null;
      top_questions: { question: string; count: number }[];
    }>(`/v1/bots/${botId}/analytics/summary?days=${days}`),

  getUnanswered: (botId: string, days = 30) =>
    request<{ message_id: string; question: string | null; bot_answer: string; created_at: string }[]>(
      `/v1/bots/${botId}/analytics/unanswered?days=${days}`,
    ),

  addQaPair: (botId: string, question: string, answer: string) =>
    request<{ qa_pair_id: string; question: string; answer: string }>(`/v1/bots/${botId}/qa-pairs`, {
      method: "POST",
      body: JSON.stringify({ question, answer }),
    }),

  listLeads: (botId: string) =>
    request<
      { lead_id: string; conversation_id: string; name: string; email: string; phone: string; created_at: string; pushed_to_crm: boolean }[]
    >(`/v1/bots/${botId}/leads`),

  listPlans: () =>
    request<
      {
        plan_id: string; name: string; price_text: string; tagline: string; features: string[];
        is_active: boolean; sort_order: number; amount: number | null; currency: string; purchasable: boolean;
      }[]
    >("/v1/plans"),

  // Public — no auth required, used by the marketing landing page.
  publicPlans: () =>
    request<{ plan_id: string; name: string; price_text: string; tagline: string; features: string[]; sort_order: number }[]>(
      "/public/plans",
    ),

  createPlan: (body: {
    name: string; price_text?: string; tagline?: string; features?: string[]; is_active?: boolean;
    sort_order?: number; amount?: number | null; currency?: string;
  }) =>
    request<{
      plan_id: string; name: string; price_text: string; tagline: string; features: string[];
      is_active: boolean; sort_order: number; amount: number | null; currency: string; purchasable: boolean;
    }>("/v1/plans", { method: "POST", body: JSON.stringify(body) }),

  updatePlan: (
    planId: string,
    body: Partial<{
      name: string; price_text: string; tagline: string; features: string[]; is_active: boolean;
      sort_order: number; amount: number | null; clear_amount: boolean; currency: string;
    }>,
  ) =>
    request<{
      plan_id: string; name: string; price_text: string; tagline: string; features: string[];
      is_active: boolean; sort_order: number; amount: number | null; currency: string; purchasable: boolean;
    }>(`/v1/plans/${planId}`, { method: "PATCH", body: JSON.stringify(body) }),

  deletePlan: (planId: string) =>
    request<{ deleted: boolean }>(`/v1/plans/${planId}`, { method: "DELETE" }),

  listGateways: () =>
    request<
      { code: string; name: string; is_primary: boolean; enabled: boolean; test_client_id: string; test_configured: boolean; live_client_id: string; live_configured: boolean }[]
    >("/v1/billing/gateways"),

  updateGateway: (
    code: string,
    body: Partial<{ test_client_id: string; test_client_secret: string; live_client_id: string; live_client_secret: string; is_primary: boolean; enabled: boolean }>,
  ) =>
    request<{ code: string; name: string; is_primary: boolean; enabled: boolean; test_client_id: string; test_configured: boolean; live_client_id: string; live_configured: boolean }>(
      `/v1/billing/gateways/${code}`,
      { method: "PUT", body: JSON.stringify(body) },
    ),

  getBillingProfile: () =>
    request<{
      supplier_name: string; supplier_gstin: string; supplier_address: string; supplier_city: string;
      supplier_state: string; supplier_country: string; supplier_pincode: string; supplier_email: string; supplier_phone: string;
    }>("/v1/billing/profile"),

  updateBillingProfile: (body: {
    supplier_name: string; supplier_gstin: string; supplier_address: string; supplier_city: string;
    supplier_state: string; supplier_country: string; supplier_pincode: string; supplier_email: string; supplier_phone: string;
  }) =>
    request<typeof body>("/v1/billing/profile", { method: "PUT", body: JSON.stringify(body) }),

  listAvailableGateways: () =>
    request<{ code: "razorpay" | "stripe"; name: string }[]>("/v1/billing/gateways/available"),

  createOrder: (
    workspaceId: string,
    body: {
      plan_id: string;
      gateway_code: "razorpay" | "stripe";
      customer_name?: string;
      customer_gstin?: string;
      customer_address?: string;
      customer_city?: string;
      customer_state?: string;
      customer_country?: string;
      customer_pincode?: string;
      success_url?: string;
      cancel_url?: string;
    },
  ) =>
    request<{
      order_id: string; workspace_id: string; plan_id: string; gateway_code: string; payment_mode: string;
      amount: number; currency: string; status: string; invoice_number: string;
      razorpay?: { gateway_order_id: string; amount: number; currency: string; key_id: string };
      stripe?: { gateway_order_id: string; checkout_url: string };
    }>(`/v1/workspaces/${workspaceId}/orders`, { method: "POST", body: JSON.stringify(body) }),

  confirmOrder: (orderId: string) =>
    request<{ order_id: string; status: string; invoice_number: string }>(`/v1/orders/${orderId}/confirm`, {
      method: "POST",
    }),

  listOrders: (workspaceId: string) =>
    request<
      {
        order_id: string; plan_id: string; gateway_code: string; amount: number; currency: string;
        status: string; invoice_number: string; created_at: string; paid_at: string | null;
      }[]
    >(`/v1/workspaces/${workspaceId}/orders`),

  // The invoice endpoint reads auth from the Authorization header, which a
  // plain <a href> can't set — fetch it with the header attached and hand
  // the caller a blob: URL to open/download instead.
  openInvoice: async (orderId: string, invoiceNumber: string, format: "html" | "pdf" = "pdf") => {
    const token = getToken();
    const resp = await fetch(`${API_URL}/v1/orders/${orderId}/invoice?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new ApiError(resp.status, body.detail || `Request failed (${resp.status})`);
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    if (format === "pdf") {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoiceNumber || orderId}.pdf`;
      a.click();
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  },

  // Not routed through request() — that helper always sets
  // Content-Type: application/json and JSON.stringify()s the body, which
  // breaks multipart uploads. The browser sets the correct multipart
  // boundary itself as long as we don't set Content-Type by hand.
  createFileSource: async (botId: string, file: File, visibility: "customer" | "internal" = "customer") => {
    const token = getToken();
    const form = new FormData();
    form.append("bot_id", botId);
    form.append("visibility", visibility);
    form.append("file", file);

    const resp = await fetch(`${API_URL}/v1/sources/file`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new ApiError(resp.status, body.detail || `Request failed (${resp.status})`);
    }
    return resp.json() as Promise<{ source_id: string; job_id: number; status: string }>;
  },

  submitContact: (body: { name: string; email: string; company?: string; message: string }) =>
    request<{ email_sent: boolean }>("/public/contact", { method: "POST", body: JSON.stringify(body) }),
};

export { API_URL };
