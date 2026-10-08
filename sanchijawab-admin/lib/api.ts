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

export interface WidgetTrigger {
  id: string; type: "time" | "scroll" | "exit" | "visits"; value: number; message: string; page_pattern: string;
  variant?: "" | "A" | "B";
}

export interface ActionParam {
  name: string; description: string; required: boolean;
}

export interface ActionInput {
  name: string; label: string; description: string; url: string; params: ActionParam[];
  requires_confirmation: boolean; enabled: boolean;
}

export interface ActionRow extends ActionInput {
  action_id: string; signed: boolean;
}

export interface ProductInput {
  name: string; price: string; description: string; image_url: string; url: string;
}

export interface ProductRow extends ProductInput {
  product_id: string;
}

export interface BusinessHours {
  timezone?: string;
  hours?: Record<string, [string, string][]>;
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
    request<{ user_id: string; email: string; role: string; active: boolean; email_notifications: boolean }[]>(
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

  createSource: (
    botId: string,
    url: string,
    visibility: "customer" | "internal" = "customer",
    opts?: {
      mode?: "single_page" | "sitemap" | "whole_domain";
      includePatterns?: string;
      excludePatterns?: string;
      maxPages?: number;
      ownershipConfirmed?: boolean;
      rescanIntervalDays?: number;
    }
  ) =>
    request<{ source_id: string; job_id: number; status: string }>("/v1/sources", {
      method: "POST",
      body: JSON.stringify({
        bot_id: botId,
        url,
        visibility,
        ownership_confirmed: opts?.ownershipConfirmed ?? false,
        ...(opts?.mode ? { mode: opts.mode } : {}),
        ...(opts?.includePatterns ? { include_patterns: opts.includePatterns } : {}),
        ...(opts?.excludePatterns ? { exclude_patterns: opts.excludePatterns } : {}),
        ...(opts?.maxPages ? { max_pages: opts.maxPages } : {}),
        ...(opts?.rescanIntervalDays ? { rescan_interval_days: opts.rescanIntervalDays } : {}),
      }),
    }),

  updateSource: (sourceId: string, rescanIntervalDays: number) =>
    request<{ source_id: string; rescan_interval_days: number }>(`/v1/sources/${sourceId}`, {
      method: "PATCH",
      body: JSON.stringify({ rescan_interval_days: rescanIntervalDays }),
    }),

  stopSource: (sourceId: string) =>
    request<{ job_id: number; status: string }>(`/v1/sources/${sourceId}/stop`, { method: "POST" }),

  sourceStatus: (jobId: number) =>
    request<{ job_id: number; status: string; error: string | null; pages_done: number; pages_total: number | null }>(
      `/v1/sources/${jobId}/status`
    ),

  listSources: (botId: string) =>
    request<
      {
        source_id: string;
        url: string;
        type: string;
        visibility: string;
        job_status: string | null;
        job_error: string | null;
        pages_done: number | null;
        pages_total: number | null;
        rescan_interval_days: number;
        next_scan_at: string | null;
      }[]
    >(`/v1/bots/${botId}/sources`),

  deleteSource: (sourceId: string) =>
    request<{ deleted: boolean }>(`/v1/sources/${sourceId}`, { method: "DELETE" }),

  rescanSource: (sourceId: string) =>
    request<{ source_id: string; job_id: number; status: string }>(`/v1/sources/${sourceId}/rescan`, {
      method: "POST",
    }),

  listDocuments: (sourceId: string) =>
    request<
      {
        document_id: string;
        url: string;
        title: string;
        status: string;
        disabled: boolean;
        error: string | null;
        last_crawled_at: string | null;
      }[]
    >(`/v1/sources/${sourceId}/documents`),

  getDocument: (documentId: string) =>
    request<{ document_id: string; url: string; title: string; status: string; disabled: boolean; content: string }>(
      `/v1/documents/${documentId}`
    ),

  editDocument: (documentId: string, content: string) =>
    request<{ document_id: string; status: string; stats: Record<string, number> }>(`/v1/documents/${documentId}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }),

  disableDocument: (documentId: string) =>
    request<{ document_id: string; disabled: boolean; status: string }>(`/v1/documents/${documentId}/disable`, {
      method: "POST",
    }),

  enableDocument: (documentId: string) =>
    request<{ document_id: string; disabled: boolean; status: string }>(`/v1/documents/${documentId}/enable`, {
      method: "POST",
    }),

  deleteDocument: (documentId: string) =>
    request<{ deleted: boolean }>(`/v1/documents/${documentId}`, { method: "DELETE" }),

  getBot: (botId: string) =>
    request<{
      bot_id: string; name: string; persona: string; instructions: string;
      model_tier: string; allowed_domains: string[]; avatar_id: string; avatar_name: string;
      crm_webhook_url: string; handoff_keywords: string; business_hours: BusinessHours;
      slack_webhook_url: string; retention_days: number | null;
    }>(`/v1/bots/${botId}`),

  installCheck: (botId: string) =>
    request<{ installed: boolean; last_seen_at: string | null; last_seen_host: string | null }>(
      `/v1/bots/${botId}/install-check`,
    ),

  updateBot: (
    botId: string,
    body: Partial<{
      name: string; persona: string; instructions: string; model_tier: string; allowed_domains: string[];
      avatar_id: string; avatar_name: string; crm_webhook_url: string; handoff_keywords: string;
      business_hours: BusinessHours; slack_webhook_url: string; retention_days: number;
    }>,
  ) =>
    request<{
      bot_id: string; name: string; persona: string; instructions: string;
      model_tier: string; allowed_domains: string[]; avatar_id: string; avatar_name: string;
      crm_webhook_url: string; handoff_keywords: string; business_hours: BusinessHours;
      slack_webhook_url: string; retention_days: number | null;
    }>(`/v1/bots/${botId}`, { method: "PATCH", body: JSON.stringify(body) }),

  listNotifications: (unreadOnly = false) =>
    request<{
      unread_count: number;
      notifications: {
        notification_id: string; bot_id: string; conversation_id: string; kind: string;
        message: string; read: boolean; created_at: string;
      }[];
    }>(`/v1/notifications${unreadOnly ? "?unread_only=true" : ""}`),

  markNotificationRead: (notificationId: string) =>
    request<{ notification_id: string; read: boolean }>(`/v1/notifications/${notificationId}/read`, { method: "POST" }),

  markAllNotificationsRead: () =>
    request<{ marked_read: boolean }>(`/v1/notifications/mark-all-read`, { method: "POST" }),

  updateNotificationPreferences: (workspaceId: string, emailNotifications: boolean) =>
    request<{ email_notifications: boolean }>(`/v1/workspaces/${workspaceId}/notification-preferences`, {
      method: "PATCH", body: JSON.stringify({ email_notifications: emailNotifications }),
    }),

  listTeams: (botId: string) =>
    request<{ team_id: string; name: string }[]>(`/v1/bots/${botId}/teams`),

  createTeam: (botId: string, name: string) =>
    request<{ team_id: string; name: string }>(`/v1/bots/${botId}/teams`, {
      method: "POST", body: JSON.stringify({ name }),
    }),

  deleteTeam: (teamId: string) =>
    request<{ deleted: boolean }>(`/v1/teams/${teamId}`, { method: "DELETE" }),

  listRoutingRules: (botId: string) =>
    request<{ rule_id: string; team_id: string; page_pattern: string; language: string; priority: number }[]>(
      `/v1/bots/${botId}/routing-rules`,
    ),

  createRoutingRule: (
    botId: string,
    body: { team_id: string; page_pattern?: string; language?: string; priority?: number },
  ) =>
    request<{ rule_id: string; team_id: string; page_pattern: string; language: string; priority: number }>(
      `/v1/bots/${botId}/routing-rules`, { method: "POST", body: JSON.stringify(body) },
    ),

  deleteRoutingRule: (ruleId: string) =>
    request<{ deleted: boolean }>(`/v1/routing-rules/${ruleId}`, { method: "DELETE" }),

  getWidgetConfig: (botId: string) =>
    request<{
      primary_color: string; theme: string; position: string;
      texts: { welcome?: string; header?: string };
      consent_text: string; require_consent: boolean;
      offsets: { x: number; y: number }; devices: { desktop: boolean; mobile: boolean };
      hidden_paths: string[]; starter_questions: string[]; locale: string; show_sources: boolean; triggers: WidgetTrigger[];
    }>(`/v1/bots/${botId}/widget-config`),

  updateWidgetConfig: (
    botId: string,
    body: Partial<{
      primary_color: string; theme: string; position: string; welcome: string; header: string;
      consent_text: string; require_consent: boolean;
      offset_x: number; offset_y: number; desktop_enabled: boolean; mobile_enabled: boolean;
      hidden_paths: string[]; starter_questions: string[]; locale: string; show_sources: boolean; triggers: WidgetTrigger[];
    }>,
  ) =>
    request<{
      primary_color: string; theme: string; position: string; texts: Record<string, string>;
      consent_text: string; require_consent: boolean;
      offsets: { x: number; y: number }; devices: { desktop: boolean; mobile: boolean };
      hidden_paths: string[]; starter_questions: string[]; locale: string; show_sources: boolean; triggers: WidgetTrigger[];
    }>(`/v1/bots/${botId}/widget-config`, { method: "PUT", body: JSON.stringify(body) }),

  exportVisitorData: (botId: string, visitorId: string) =>
    request<unknown>(`/v1/bots/${botId}/visitors/${encodeURIComponent(visitorId)}/export`),

  eraseVisitorData: (botId: string, visitorId: string) =>
    request<{ deleted_conversations: number }>(`/v1/bots/${botId}/visitors/${encodeURIComponent(visitorId)}`, {
      method: "DELETE",
    }),

  listConversations: (botId: string, status?: string) =>
    request<
      { conversation_id: string; status: string; visitor_id: string; page_url: string; started_at: string; last_message: string | null; team: string | null }[]
    >(`/v1/bots/${botId}/conversations${status ? `?status=${status}` : ""}`),

  getConversation: (conversationId: string) =>
    request<{
      conversation_id: string; status: string; visitor_id: string; page_url: string; started_at: string;
      team: string | null;
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
      csat_average: number | null; csat_count: number;
      top_questions: { question: string; count: number }[];
    }>(`/v1/bots/${botId}/analytics/summary?days=${days}`),

  getUnanswered: (botId: string, days = 30) =>
    request<{ message_id: string; question: string | null; bot_answer: string; created_at: string }[]>(
      `/v1/bots/${botId}/analytics/unanswered?days=${days}`,
    ),

  getCrawlSuccess: (botId: string, days = 30) =>
    request<{ days: number; total_jobs: number; by_status: Record<string, number>; success_rate: number | null }>(
      `/v1/bots/${botId}/analytics/crawl-success?days=${days}`,
    ),

  addQaPair: (botId: string, question: string, answer: string) =>
    request<{ qa_pair_id: string; question: string; answer: string }>(`/v1/bots/${botId}/qa-pairs`, {
      method: "POST",
      body: JSON.stringify({ question, answer }),
    }),

  triggerAnalytics: (botId: string) =>
    request<
      { trigger_id: string; type: string; message: string; variant: string; shown: number; clicked: number; click_rate: number | null }[]
    >(`/v1/bots/${botId}/analytics/triggers`),

  listActions: (botId: string) => request<ActionRow[]>(`/v1/bots/${botId}/actions`),

  createAction: (botId: string, body: ActionInput) =>
    request<ActionRow & { secret: string; secret_note: string }>(`/v1/bots/${botId}/actions`, { method: "POST", body: JSON.stringify(body) }),

  editAction: (actionId: string, body: ActionInput) =>
    request<ActionRow>(`/v1/actions/${actionId}`, { method: "PUT", body: JSON.stringify(body) }),

  deleteAction: (actionId: string) => request<{ deleted: boolean }>(`/v1/actions/${actionId}`, { method: "DELETE" }),

  rotateActionSecret: (actionId: string) =>
    request<{ secret: string; secret_note: string }>(`/v1/actions/${actionId}/rotate-secret`, { method: "POST" }),

  testAction: (actionId: string) =>
    request<{ ok: boolean; message: string; error: string }>(`/v1/actions/${actionId}/test`, { method: "POST" }),

  actionLog: (botId: string) =>
    request<{ action: string; ok: boolean; http_status: number | null; confirmed_by_visitor: boolean; duration_ms: number; error: string; at: string }[]>(
      `/v1/bots/${botId}/actions/log`,
    ),

  listProducts: (botId: string) =>
    request<ProductRow[]>(`/v1/bots/${botId}/products`),

  addProduct: (botId: string, body: ProductInput) =>
    request<ProductRow>(`/v1/bots/${botId}/products`, { method: "POST", body: JSON.stringify(body) }),

  editProduct: (productId: string, body: ProductInput) =>
    request<ProductRow>(`/v1/products/${productId}`, { method: "PUT", body: JSON.stringify(body) }),

  deleteProduct: (productId: string) =>
    request<{ deleted: boolean }>(`/v1/products/${productId}`, { method: "DELETE" }),

  clearProducts: (botId: string) =>
    request<{ deleted: number }>(`/v1/bots/${botId}/products`, { method: "DELETE" }),

  importProducts: async (botId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const token = getToken();
    const resp = await fetch(`${API_URL}/v1/bots/${botId}/products/import`, {
      method: "POST", body: form, headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new ApiError(resp.status, body.detail || `Import failed (${resp.status})`);
    return body as { imported: number; problems: string[]; problem_count: number };
  },

  listApiKeys: (workspaceId: string) =>
    request<{ key_id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked: boolean }[]>(
      `/v1/workspaces/${workspaceId}/api-keys`,
    ),

  createApiKey: (workspaceId: string, name: string) =>
    request<{ key_id: string; name: string; key: string; note: string }>(`/v1/workspaces/${workspaceId}/api-keys`, {
      method: "POST", body: JSON.stringify({ name }),
    }),

  revokeApiKey: (workspaceId: string, keyId: string) =>
    request<{ revoked: boolean }>(`/v1/workspaces/${workspaceId}/api-keys/${keyId}`, { method: "DELETE" }),

  suggestReply: (conversationId: string) =>
    request<{ suggestion: string; sources: string[] }>(`/v1/conversations/${conversationId}/suggest-reply`, {
      method: "POST",
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
        limits: Record<string, number | null>;
      }[]
    >("/v1/plans"),

  // Public — no auth required, used by the marketing landing page.
  publicPlans: () =>
    request<{ plan_id: string; name: string; price_text: string; tagline: string; features: string[]; sort_order: number }[]>(
      "/public/plans",
    ),

  createPlan: (body: {
    name: string; price_text?: string; tagline?: string; features?: string[]; is_active?: boolean;
    sort_order?: number; amount?: number | null; currency?: string; limits?: Record<string, number | null>;
  }) =>
    request<{
      plan_id: string; name: string; price_text: string; tagline: string; features: string[];
      is_active: boolean; sort_order: number; amount: number | null; currency: string; purchasable: boolean;
        limits: Record<string, number | null>;
    }>("/v1/plans", { method: "POST", body: JSON.stringify(body) }),

  updatePlan: (
    planId: string,
    body: Partial<{
      name: string; price_text: string; tagline: string; features: string[]; is_active: boolean;
      sort_order: number; amount: number | null; clear_amount: boolean; currency: string;
      limits: Record<string, number | null>;
    }>,
  ) =>
    request<{
      plan_id: string; name: string; price_text: string; tagline: string; features: string[];
      is_active: boolean; sort_order: number; amount: number | null; currency: string; purchasable: boolean;
        limits: Record<string, number | null>;
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

  getUsage: (workspaceId: string) =>
    request<{
      on_trial: boolean; trial_ends_at: string | null; plan_id: string | null; plan_name: string | null;
      messages: { used: number; limit: number | null };
      pages: { used: number; limit: number | null };
      files: { used: number; limit: number | null };
      seats: { used: number; limit: number | null };
    }>(`/v1/workspaces/${workspaceId}/usage`),

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
