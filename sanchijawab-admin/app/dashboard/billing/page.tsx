"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { ProfileMenu } from "@/components/ProfileMenu";

type Plan = {
  plan_id: string; name: string; price_text: string; tagline: string;
  features: string[]; is_active: boolean; sort_order: number;
  amount: number | null; currency: string; purchasable: boolean;
};

type Gateway = {
  code: string; name: string; is_primary: boolean; enabled: boolean;
  test_client_id: string; test_configured: boolean; live_client_id: string; live_configured: boolean;
};

type BillingProfile = {
  supplier_name: string; supplier_gstin: string; supplier_address: string; supplier_city: string;
  supplier_state: string; supplier_country: string; supplier_pincode: string; supplier_email: string; supplier_phone: string;
};

type Gateway2 = { code: "razorpay" | "stripe"; name: string };

type OrderRow = {
  order_id: string; plan_id: string; gateway_code: string; amount: number; currency: string;
  status: string; invoice_number: string; created_at: string; paid_at: string | null;
};

const EMPTY_CUSTOMER = {
  customer_name: "", customer_gstin: "", customer_address: "",
  customer_city: "", customer_state: "", customer_country: "India", customer_pincode: "",
};

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load Razorpay checkout"));
    document.body.appendChild(script);
  });
}

const EMPTY_FORM = {
  name: "", price_text: "", tagline: "", featuresText: "", is_active: true, sort_order: 0,
  amountText: "", currency: "INR",
};

const EMPTY_PROFILE: BillingProfile = {
  supplier_name: "", supplier_gstin: "", supplier_address: "", supplier_city: "",
  supplier_state: "", supplier_country: "India", supplier_pincode: "", supplier_email: "", supplier_phone: "",
};

function formFromPlan(p: Plan) {
  return {
    name: p.name, price_text: p.price_text, tagline: p.tagline,
    featuresText: p.features.join("\n"), is_active: p.is_active, sort_order: p.sort_order,
    amountText: p.amount === null ? "" : String(p.amount), currency: p.currency,
  };
}

export default function BillingPage() {
  const [workspaceName, setWorkspaceName] = useState("…");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [availableGateways, setAvailableGateways] = useState<Gateway2[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutNotice, setCheckoutNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [gatewayForms, setGatewayForms] = useState<Record<string, Partial<Gateway> & { test_client_secret?: string; live_client_secret?: string }>>({});
  const [savingGateway, setSavingGateway] = useState<string | null>(null);

  const [profile, setProfile] = useState<BillingProfile>(EMPTY_PROFILE);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);

  async function loadPlans() {
    try {
      setPlans(await api.listPlans());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load plans");
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders(wsId: string) {
    try {
      setOrders(await api.listOrders(wsId));
    } catch {
      // non-fatal — the orders history is a nice-to-have, not the main flow
    }
  }

  useEffect(() => {
    api.me().then((m) => {
      setEmail(m.email);
      setIsSuperAdmin(m.is_super_admin);
      if (m.is_super_admin) {
        api.listGateways().then(setGateways).catch(() => {});
        api.getBillingProfile().then(setProfile).catch(() => {});
      }
    }).catch(() => {});
    api.listAvailableGateways().then(setAvailableGateways).catch(() => {});
    api.listWorkspaces().then(async (list) => {
      const ws = list[0];
      if (!ws) return;
      setWorkspaceName(ws.name);
      setWorkspaceId(ws.workspace_id);
      await loadOrders(ws.workspace_id);

      // Stripe redirects the browser back here after checkout. We don't know
      // the order id until after creating it (too late to bake into the
      // success_url we send Stripe up front), so pay() stashes it in
      // sessionStorage before leaving the page and we pick it up here —
      // confirming server-side, which re-verifies with Stripe rather than
      // ever trusting the redirect alone.
      const pendingOrderId = sessionStorage.getItem("sj_pending_order_id");
      if (pendingOrderId) {
        sessionStorage.removeItem("sj_pending_order_id");
        try {
          await api.confirmOrder(pendingOrderId);
          setCheckoutNotice({ kind: "success", text: "Payment confirmed — your invoice is ready below." });
        } catch (err) {
          setCheckoutNotice({
            kind: "error",
            text:
              err instanceof ApiError && err.status === 402
                ? "That checkout wasn't completed, so nothing was charged."
                : err instanceof ApiError
                  ? err.message
                  : "We couldn't confirm that payment — contact support if you were charged.",
          });
        }
        await loadOrders(ws.workspace_id);
      }
    });
    loadPlans();
  }, []);

  function startEdit(p: Plan) {
    setCreating(false);
    setEditingId(p.plan_id);
    setForm(formFromPlan(p));
  }

  function startCreate() {
    setEditingId(null);
    setCreating(true);
    setForm(EMPTY_FORM);
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
  }

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const amountTrimmed = form.amountText.trim();
    const body = {
      name: form.name,
      price_text: form.price_text,
      tagline: form.tagline,
      features: form.featuresText.split("\n").map((f) => f.trim()).filter(Boolean),
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 0,
      currency: form.currency,
      ...(amountTrimmed ? { amount: Number(amountTrimmed) } : { amount: null, clear_amount: true }),
    };
    try {
      if (creating) {
        await api.createPlan(body);
      } else if (editingId) {
        await api.updatePlan(editingId, body);
      }
      cancelEdit();
      await loadPlans();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save plan");
    } finally {
      setSaving(false);
    }
  }

  async function removePlan(planId: string) {
    setError(null);
    try {
      await api.deletePlan(planId);
      await loadPlans();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete plan");
    }
  }

  function startCheckout(plan: Plan) {
    setCheckoutNotice(null);
    setCustomerForm(EMPTY_CUSTOMER);
    setCheckoutPlan(plan);
  }

  async function pay(gatewayCode: "razorpay" | "stripe") {
    if (!checkoutPlan || !workspaceId) return;
    setCheckingOut(true);
    setCheckoutNotice(null);
    try {
      const returnUrl = new URL(window.location.href);
      returnUrl.search = "";
      const order = await api.createOrder(workspaceId, {
        plan_id: checkoutPlan.plan_id,
        gateway_code: gatewayCode,
        ...customerForm,
        success_url: returnUrl.toString(),
        cancel_url: returnUrl.toString(),
      });

      if (gatewayCode === "stripe" && order.stripe) {
        sessionStorage.setItem("sj_pending_order_id", order.order_id);
        window.location.href = order.stripe.checkout_url;
        return;
      }

      if (gatewayCode === "razorpay" && order.razorpay) {
        await loadRazorpayScript();
        const rzp = new window.Razorpay({
          key: order.razorpay.key_id,
          amount: order.razorpay.amount,
          currency: order.razorpay.currency,
          order_id: order.razorpay.gateway_order_id,
          name: "SanchiJawab",
          description: checkoutPlan.name,
          prefill: { name: customerForm.customer_name, email: email || "" },
          theme: { color: "#3D46C9" },
          handler: async () => {
            try {
              await api.confirmOrder(order.order_id);
              setCheckoutNotice({ kind: "success", text: "Payment confirmed — your invoice is ready below." });
              setCheckoutPlan(null);
              if (workspaceId) await loadOrders(workspaceId);
            } catch (err) {
              setCheckoutNotice({
                kind: "error",
                text: err instanceof ApiError ? err.message : "Payment went through but confirmation failed — contact support.",
              });
            }
          },
          modal: {
            ondismiss: () => setCheckingOut(false),
          },
        });
        rzp.open();
        return; // leave checkingOut true until the modal's handler/ondismiss fires
      }
    } catch (err) {
      setCheckoutNotice({ kind: "error", text: err instanceof ApiError ? err.message : "Couldn't start checkout" });
    }
    setCheckingOut(false);
  }

  function gatewayFormValue(code: string, field: string, fallback: string) {
    return (gatewayForms[code]?.[field as keyof Gateway] as string | undefined) ?? fallback;
  }

  async function saveGateway(code: string) {
    setSavingGateway(code);
    setError(null);
    const f = gatewayForms[code] || {};
    try {
      const updated = await api.updateGateway(code, {
        test_client_id: f.test_client_id,
        test_client_secret: f.test_client_secret || undefined,
        live_client_id: f.live_client_id,
        live_client_secret: f.live_client_secret || undefined,
        enabled: f.enabled,
      });
      setGateways((gs) => gs.map((g) => (g.code === code ? updated : g)));
      setGatewayForms((prev) => ({ ...prev, [code]: {} }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save gateway");
    } finally {
      setSavingGateway(null);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileNotice(null);
    setError(null);
    try {
      await api.updateBillingProfile(profile);
      setProfileNotice("Saved.");
      setTimeout(() => setProfileNotice(null), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save billing profile");
    } finally {
      setSavingProfile(false);
    }
  }

  const visiblePlans = isSuperAdmin ? plans : plans.filter((p) => p.is_active);

  return (
    <div className="max-w-[1240px] mx-auto grid grid-cols-1 md:grid-cols-[248px_1fr] gap-5 items-start">
      <WorkspaceSidebar workspaceName={workspaceName} active="/dashboard/billing" />

      <main className="min-w-0">
        <div className="flex justify-between items-center mb-5 gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] font-semibold font-display">Billing &amp; plan</h1>
            <p className="text-[13px] text-fg-muted mt-0.5">
              {isSuperAdmin
                ? "You're a super admin — plans, gateways and GST details here are editable and feed the public pricing page + invoices."
                : "Subscribe to a plan below, or contact us for a custom one."}
            </p>
          </div>
          <ProfileMenu email={email} />
        </div>

        {error && <div className="text-[13px] text-danger bg-danger-soft rounded-lg p-3 mb-4">{error}</div>}
        {checkoutNotice && (
          <div
            className={`text-[13px] rounded-lg p-3 mb-4 ${
              checkoutNotice.kind === "success" ? "text-success bg-success-soft" : "text-danger bg-danger-soft"
            }`}
          >
            {checkoutNotice.text}
          </div>
        )}

        {loading && <p className="text-fg-muted text-sm">Loading…</p>}

        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visiblePlans.map((p) => (
              <div
                key={p.plan_id}
                className={`bg-surface border rounded-2xl shadow-card p-5 flex flex-col ${
                  p.is_active ? "border-border" : "border-border opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-[17px] font-semibold">{p.name}</h3>
                  <div className="flex gap-1">
                    {!p.is_active && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-fg-faint bg-surface-2 rounded-full px-2 py-0.5">
                        Hidden
                      </span>
                    )}
                    {isSuperAdmin && (
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                          p.purchasable ? "text-success bg-success-soft" : "text-fg-faint bg-surface-2"
                        }`}
                      >
                        {p.purchasable ? "Purchasable" : "Display only"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-[20px] font-semibold tabular">{p.price_text || "—"}</div>
                <p className="mt-1 text-[13px] text-fg-muted">{p.tagline}</p>
                <ul className="mt-3 space-y-1.5 flex-1">
                  {p.features.map((f, i) => (
                    <li key={i} className="text-[12.5px] text-fg flex gap-1.5">
                      <span className="text-success">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {isSuperAdmin && (
                  <div className="mt-4 flex gap-2 pt-3 border-t border-border">
                    <button
                      onClick={() => startEdit(p)}
                      className="text-[12.5px] font-semibold text-accent-ink hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removePlan(p.plan_id)}
                      className="text-[12.5px] font-semibold text-danger hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                )}
                {!isSuperAdmin && (
                  <div className="mt-4 pt-3 border-t border-border">
                    {p.purchasable ? (
                      <button
                        onClick={() => startCheckout(p)}
                        disabled={availableGateways.length === 0}
                        className="w-full bg-accent text-white rounded-lg py-2 text-[13px] font-semibold hover:brightness-90 transition-[filter] disabled:opacity-50"
                        title={availableGateways.length === 0 ? "No payment gateway is configured yet" : undefined}
                      >
                        Subscribe
                      </button>
                    ) : (
                      <a
                        href="/contact"
                        className="block text-center w-full border border-border rounded-lg py-2 text-[13px] font-semibold text-fg hover:bg-surface-2"
                      >
                        Contact sales
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}

            {isSuperAdmin && (
              <button
                onClick={startCreate}
                className="border border-dashed border-border rounded-2xl p-5 flex items-center justify-center text-[13.5px] font-semibold text-fg-muted hover:text-accent-ink hover:border-accent transition-colors min-h-[160px]"
              >
                + Add a plan
              </button>
            )}

            {visiblePlans.length === 0 && !isSuperAdmin && (
              <div className="col-span-full bg-surface border border-border rounded-2xl shadow-card p-5">
                <p className="text-[12.5px] text-fg-faint">No plans published yet — check back soon.</p>
              </div>
            )}
          </div>
        )}

        {checkoutPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !checkingOut && setCheckoutPlan(null)}>
            <div
              className="bg-surface border border-border rounded-2xl shadow-card p-5 w-full max-w-md space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <h3 className="font-display text-[16px] font-semibold">Subscribe to {checkoutPlan.name}</h3>
                <p className="text-[12.5px] text-fg-muted mt-0.5">
                  {checkoutPlan.price_text} &middot; billed via {availableGateways.map((g) => g.name).join(" or ")}
                </p>
              </div>

              {availableGateways.length === 0 ? (
                <p className="text-[13px] text-danger">No payment gateway is configured yet — contact support.</p>
              ) : (
                <>
                  <p className="text-[11.5px] text-fg-faint">
                    Used for your GST invoice. Leave GSTIN blank for a consumer (non-business) invoice.
                  </p>
                  <input
                    className="w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                    placeholder="Billing name"
                    value={customerForm.customer_name}
                    onChange={(e) => setCustomerForm({ ...customerForm, customer_name: e.target.value })}
                  />
                  <input
                    className="w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                    placeholder="GSTIN (optional)"
                    value={customerForm.customer_gstin}
                    onChange={(e) => setCustomerForm({ ...customerForm, customer_gstin: e.target.value })}
                  />
                  <input
                    className="w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                    placeholder="Address"
                    value={customerForm.customer_address}
                    onChange={(e) => setCustomerForm({ ...customerForm, customer_address: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <input
                      className="flex-1 border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                      placeholder="City"
                      value={customerForm.customer_city}
                      onChange={(e) => setCustomerForm({ ...customerForm, customer_city: e.target.value })}
                    />
                    <input
                      className="flex-1 border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                      placeholder="State"
                      value={customerForm.customer_state}
                      onChange={(e) => setCustomerForm({ ...customerForm, customer_state: e.target.value })}
                    />
                    <input
                      className="w-28 border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                      placeholder="Pincode"
                      value={customerForm.customer_pincode}
                      onChange={(e) => setCustomerForm({ ...customerForm, customer_pincode: e.target.value })}
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    {availableGateways.map((g) => (
                      <button
                        key={g.code}
                        onClick={() => pay(g.code)}
                        disabled={checkingOut}
                        className="flex-1 bg-accent text-white rounded-lg py-2 text-[13px] font-semibold hover:brightness-90 transition-[filter] disabled:opacity-50"
                      >
                        {checkingOut ? "Processing…" : `Pay with ${g.name}`}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button
                onClick={() => setCheckoutPlan(null)}
                disabled={checkingOut}
                className="w-full text-center text-[12.5px] font-semibold text-fg-muted hover:text-fg pt-1"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!isSuperAdmin && orders.length > 0 && (
          <>
            <h2 className="mt-10 mb-3 font-display text-[18px] font-semibold">Orders &amp; invoices</h2>
            <div className="bg-surface border border-border rounded-2xl shadow-card overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead className="bg-surface-2 text-left">
                  <tr>
                    <th className="p-2.5 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Date</th>
                    <th className="p-2.5 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Amount</th>
                    <th className="p-2.5 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Status</th>
                    <th className="p-2.5 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.order_id} className="border-t border-border">
                      <td className="p-2.5">{new Date(o.created_at).toLocaleDateString()}</td>
                      <td className="p-2.5 tabular">
                        {o.currency} {o.amount.toFixed(2)}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                            o.status === "paid"
                              ? "text-success bg-success-soft"
                              : o.status === "failed"
                                ? "text-danger bg-danger-soft"
                                : "text-fg-faint bg-surface-2"
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="p-2.5">
                        {o.status === "paid" ? (
                          <button
                            onClick={() =>
                              api.openInvoice(o.order_id, o.invoice_number).catch((err) =>
                                setError(err instanceof ApiError ? err.message : "Couldn't open invoice"),
                              )
                            }
                            className="text-[12.5px] font-semibold text-accent-ink hover:underline"
                          >
                            Download PDF
                          </button>
                        ) : (
                          <span className="text-fg-faint">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {(creating || editingId) && isSuperAdmin && (
          <form
            onSubmit={savePlan}
            className="mt-5 bg-surface border border-border rounded-2xl shadow-card p-5 max-w-lg space-y-3"
          >
            <h3 className="font-display text-[16px] font-semibold">{creating ? "New plan" : "Edit plan"}</h3>
            <div>
              <label className="text-[12.5px] font-medium">Name</label>
              <input
                required
                className="mt-1 w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[12.5px] font-medium">Price (display text, e.g. ₹2,999/mo)</label>
              <input
                className="mt-1 w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                value={form.price_text}
                onChange={(e) => setForm({ ...form, price_text: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[12.5px] font-medium">Billable amount</label>
                <p className="text-[11px] text-fg-faint mb-1">Leave blank for a display-only plan (e.g. &quot;Contact us&quot;) — can&apos;t be self-serve purchased without this.</p>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                  placeholder="999.00"
                  value={form.amountText}
                  onChange={(e) => setForm({ ...form, amountText: e.target.value })}
                />
              </div>
              <div className="w-24">
                <label className="text-[12.5px] font-medium">Currency</label>
                <input
                  className="mt-1 w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                  maxLength={8}
                />
              </div>
            </div>
            <div>
              <label className="text-[12.5px] font-medium">Tagline</label>
              <input
                className="mt-1 w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                value={form.tagline}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[12.5px] font-medium">Features (one per line)</label>
              <textarea
                className="mt-1 w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px] h-24"
                value={form.featuresText}
                onChange={(e) => setForm({ ...form, featuresText: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="text-[12.5px] font-medium flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Visible on pricing page
              </label>
              <label className="text-[12.5px] font-medium flex items-center gap-2">
                Order
                <input
                  type="number"
                  className="w-16 border border-border bg-surface-2 rounded-lg px-2 py-1 text-[13px]"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="bg-accent text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save plan"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-lg px-4 py-2 text-[13px] font-semibold text-fg-muted hover:text-fg"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {isSuperAdmin && (
          <>
            <h2 className="mt-10 mb-3 font-display text-[18px] font-semibold">Payment gateways</h2>
            <p className="text-[12.5px] text-fg-muted -mt-2 mb-3">
              Credentials are encrypted at rest and never sent back to the browser once saved. Currently in{" "}
              <strong>{"test"}</strong> mode (set <code>PAYMENT_MODE</code> in the backend&apos;s env to switch to live).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {gateways.map((g) => (
                <div key={g.code} className="bg-surface border border-border rounded-2xl shadow-card p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-[16px] font-semibold">{g.name}</h3>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                        g.test_configured ? "text-success bg-success-soft" : "text-fg-faint bg-surface-2"
                      }`}
                    >
                      {g.test_configured ? "Test keys set" : "Not configured"}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <input
                      className="w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[12.5px]"
                      placeholder="Test client/key ID"
                      value={gatewayFormValue(g.code, "test_client_id", g.test_client_id)}
                      onChange={(e) =>
                        setGatewayForms((prev) => ({ ...prev, [g.code]: { ...prev[g.code], test_client_id: e.target.value } }))
                      }
                    />
                    <input
                      type="password"
                      className="w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[12.5px]"
                      placeholder={g.test_configured ? "Test secret (leave blank to keep existing)" : "Test client secret"}
                      value={gatewayFormValue(g.code, "test_client_secret", "")}
                      onChange={(e) =>
                        setGatewayForms((prev) => ({ ...prev, [g.code]: { ...prev[g.code], test_client_secret: e.target.value } }))
                      }
                    />
                  </div>
                  <button
                    onClick={() => saveGateway(g.code)}
                    disabled={savingGateway === g.code}
                    className="mt-3 bg-accent text-white rounded-lg px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
                  >
                    {savingGateway === g.code ? "Saving…" : "Save"}
                  </button>
                </div>
              ))}
            </div>

            <h2 className="mt-10 mb-3 font-display text-[18px] font-semibold">GST / invoice details</h2>
            <p className="text-[12.5px] text-fg-muted -mt-2 mb-3">
              Your own registration details — printed on every invoice, and used to determine CGST+SGST (same state)
              vs. IGST (different state) for each order.
            </p>
            <form onSubmit={saveProfile} className="bg-surface border border-border rounded-2xl shadow-card p-5 max-w-lg space-y-3">
              <input
                className="w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                placeholder="Legal/business name"
                value={profile.supplier_name}
                onChange={(e) => setProfile({ ...profile, supplier_name: e.target.value })}
              />
              <input
                className="w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                placeholder="GSTIN"
                value={profile.supplier_gstin}
                onChange={(e) => setProfile({ ...profile, supplier_gstin: e.target.value })}
              />
              <input
                className="w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                placeholder="Address"
                value={profile.supplier_address}
                onChange={(e) => setProfile({ ...profile, supplier_address: e.target.value })}
              />
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                  placeholder="City"
                  value={profile.supplier_city}
                  onChange={(e) => setProfile({ ...profile, supplier_city: e.target.value })}
                />
                <input
                  className="flex-1 border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                  placeholder="State"
                  value={profile.supplier_state}
                  onChange={(e) => setProfile({ ...profile, supplier_state: e.target.value })}
                />
                <input
                  className="w-28 border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                  placeholder="Pincode"
                  value={profile.supplier_pincode}
                  onChange={(e) => setProfile({ ...profile, supplier_pincode: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                  placeholder="Billing email"
                  value={profile.supplier_email}
                  onChange={(e) => setProfile({ ...profile, supplier_email: e.target.value })}
                />
                <input
                  className="flex-1 border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]"
                  placeholder="Phone"
                  value={profile.supplier_phone}
                  onChange={(e) => setProfile({ ...profile, supplier_phone: e.target.value })}
                />
              </div>
              <div className="flex gap-2 items-center">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="bg-accent text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
                >
                  {savingProfile ? "Saving…" : "Save GST details"}
                </button>
                {profileNotice && <span className="text-[12.5px] text-success">{profileNotice}</span>}
              </div>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
