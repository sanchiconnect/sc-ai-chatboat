"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { resolveWorkspace } from "@/lib/workspace-store";
import { ProfileMenu } from "@/components/ProfileMenu";
import { pingNotifications, useLive } from "@/lib/use-live";
import {
  BillingForm, EMPTY_BILLING, focusFirstError, validateBilling,
  type BillingErrors, type BillingValues,
} from "@/components/BillingForm";

type PaymentStatus = { kind: "success" | "failed" | "cancelled"; title: string; text: string };

const STATUS_STYLE: Record<PaymentStatus["kind"], { box: string; icon: string }> = {
  success: { box: "text-success bg-success-soft border-success/30", icon: "✓" },
  failed: { box: "text-danger bg-danger-soft border-danger/30", icon: "✕" },
  cancelled: { box: "text-warning bg-warning-soft border-warning/30", icon: "!" },
};

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "text-success bg-success-soft" },
  failed: { label: "Failed", cls: "text-danger bg-danger-soft" },
  cancelled: { label: "Cancelled", cls: "text-warning bg-warning-soft" },
  created: { label: "Not completed", cls: "text-fg-faint bg-surface-2" },
};

type Plan = {
  plan_id: string; name: string; price_text: string; tagline: string;
  features: string[]; is_active: boolean; sort_order: number;
  amount: number | null; currency: string; purchasable: boolean;
  limits: Record<string, number | null>;
};

type Gateway2 = { code: "razorpay" | "stripe"; name: string };

type OrderRow = {
  order_id: string; plan_id: string; gateway_code: string; amount: number; currency: string;
  status: string; invoice_number: string; created_at: string; paid_at: string | null;
};

type Usage = {
  on_trial: boolean; trial_ends_at: string | null; plan_id: string | null; plan_name: string | null;
  messages: { used: number; limit: number | null };
  pages: { used: number; limit: number | null };
  files: { used: number; limit: number | null };
  seats: { used: number; limit: number | null };
};

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, cb: (resp: { error?: { description?: string } }) => void) => void;
    };
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

export default function BillingPage() {
  const [workspaceName, setWorkspaceName] = useState("…");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<{ workspace_id: string; name: string }[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [availableGateways, setAvailableGateways] = useState<Gateway2[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [status, setStatus] = useState<PaymentStatus | null>(null);

  // The workspace's saved billing details (owners/admins only). One form
  // state feeds both the "Billing details" card and the checkout window.
  const [details, setDetails] = useState<BillingValues>(EMPTY_BILLING);
  const [detailErrors, setDetailErrors] = useState<BillingErrors>({});
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsNotice, setDetailsNotice] = useState<string | null>(null);
  const canManageBilling = role === "owner" || role === "admin";

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
    }).catch(() => {});
    api.listAvailableGateways().then(setAvailableGateways).catch(() => {});
    api.listWorkspaces().then(async (list) => {
      setWorkspaces(list);
      const ws = resolveWorkspace(list);
      if (!ws) return;
      setWorkspaceName(ws.name);
      setWorkspaceId(ws.workspace_id);
      setRole(ws.role);
      if (ws.role === "owner" || ws.role === "admin") {
        api.getBillingDetails(ws.workspace_id)
          .then((d) => setDetails({ ...EMPTY_BILLING, ...d, phone_country_code: d.phone_country_code || "+91" }))
          .catch(() => {});
      }
      await loadOrders(ws.workspace_id);
      api.getUsage(ws.workspace_id).then(setUsage).catch(() => {});

      // Stripe redirects the browser back here after checkout. We don't know
      // the order id until after creating it (too late to bake into the
      // success_url we send Stripe up front), so pay() stashes it in
      // sessionStorage before leaving the page and we pick it up here —
      // confirming server-side, which re-verifies with Stripe rather than
      // ever trusting the redirect alone.
      const pendingOrderId = sessionStorage.getItem("sj_pending_order_id");
      if (pendingOrderId) {
        sessionStorage.removeItem("sj_pending_order_id");
        const cancelledOnStripe = new URLSearchParams(window.location.search).get("payment") === "cancelled";
        window.history.replaceState(null, "", window.location.pathname);
        if (cancelledOnStripe) {
          await api.recordOrderOutcome(pendingOrderId, "cancelled").catch(() => {});
          setStatus({ kind: "cancelled", title: "Payment cancelled", text: "You left the payment page, so nothing was charged. You can subscribe again whenever you're ready." });
        } else {
          try {
            await api.confirmOrder(pendingOrderId);
            setStatus({ kind: "success", title: "Payment successful", text: "Your plan is active and your invoice is ready below." });
            api.getUsage(ws.workspace_id).then(setUsage).catch(() => {});
          } catch (err) {
            if (err instanceof ApiError && err.status === 402) {
              await api.recordOrderOutcome(pendingOrderId, "failed").catch(() => {});
              setStatus({ kind: "failed", title: "Payment not completed", text: "That checkout wasn't completed, so nothing was charged. Please try again." });
            } else {
              setStatus({
                kind: "failed", title: "We couldn't confirm that payment",
                text: err instanceof ApiError ? err.message : "Contact support if you were charged.",
              });
            }
          }
        }
        await loadOrders(ws.workspace_id);
      }
    });
    loadPlans();
  }, []);

  // Usage bars and order history stay current without a refresh.
  useLive(() => {
    if (!workspaceId) return;
    api.getUsage(workspaceId).then(setUsage).catch(() => {});
    api.listOrders(workspaceId).then(setOrders).catch(() => {});
  }, 12_000, [workspaceId]);

  // Editing a field clears that field's error straight away.
  function onDetailsChange(next: BillingValues) {
    setDetails(next);
    setDetailErrors((prev) => {
      const kept: BillingErrors = {};
      (Object.keys(prev) as (keyof BillingValues)[]).forEach((k) => {
        if (next[k] === details[k]) kept[k] = prev[k];
      });
      return kept;
    });
  }

  function startCheckout(plan: Plan) {
    setStatus(null);
    setDetailErrors({});
    setCheckoutPlan(plan);
  }

  async function saveDetails(e?: React.FormEvent) {
    e?.preventDefault();
    if (!workspaceId) return false;
    const errors = validateBilling(details);
    setDetailErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstError(errors, "bd");
      return false;
    }
    setSavingDetails(true);
    setDetailsNotice(null);
    try {
      await api.saveBillingDetails(workspaceId, details);
      setDetailsNotice("Billing details saved.");
      setTimeout(() => setDetailsNotice(null), 2500);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save billing details");
      return false;
    } finally {
      setSavingDetails(false);
    }
  }

  async function pay(gatewayCode: "razorpay" | "stripe") {
    if (!checkoutPlan || !workspaceId) return;
    // Nothing reaches a payment gateway until every required detail is filled:
    // highlight what's missing and stop here.
    const errors = validateBilling(details);
    setDetailErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstError(errors, "co");
      return;
    }
    setCheckingOut(true);
    setStatus(null);
    let orderId: string | null = null;
    let failure: string | null = null;
    try {
      // Remember these details for next time and for the invoice.
      await api.saveBillingDetails(workspaceId, details).catch(() => {});
      const returnUrl = new URL(window.location.href);
      returnUrl.search = "";
      const cancelUrl = new URL(returnUrl.toString());
      cancelUrl.searchParams.set("payment", "cancelled");
      const order = await api.createOrder(workspaceId, {
        plan_id: checkoutPlan.plan_id,
        gateway_code: gatewayCode,
        customer_name: details.name,
        customer_gstin: details.gstin,
        customer_address: details.address,
        customer_city: details.city,
        customer_state: details.state,
        customer_country: details.country,
        customer_pincode: details.pincode,
        customer_phone_country_code: details.phone_country_code,
        customer_phone: details.phone,
        success_url: returnUrl.toString(),
        cancel_url: cancelUrl.toString(),
      });
      orderId = order.order_id;

      if (gatewayCode === "stripe" && order.stripe) {
        sessionStorage.setItem("sj_pending_order_id", order.order_id);
        window.location.href = order.stripe.checkout_url;
        return;
      }

      if (gatewayCode === "razorpay" && order.razorpay) {
        await loadRazorpayScript();
        let lastFailure = ""; // set if the gateway reports a declined/failed attempt
        const rzp = new window.Razorpay({
          key: order.razorpay.key_id,
          amount: order.razorpay.amount,
          currency: order.razorpay.currency,
          order_id: order.razorpay.gateway_order_id,
          name: "SanchiJawab",
          description: checkoutPlan.name,
          prefill: { name: details.name, email: email || "", contact: `${details.phone_country_code}${details.phone.replace(/\D/g, "")}` },
          theme: { color: "#3D46C9" },
          handler: async () => {
            try {
              await api.confirmOrder(order.order_id);
              setStatus({ kind: "success", title: "Payment successful", text: "Your plan is active and your invoice is ready below." });
              setCheckoutPlan(null);
              api.getUsage(workspaceId).then(setUsage).catch(() => {});
            } catch (err) {
              setStatus({
                kind: "failed", title: "Payment received, but we couldn't confirm it",
                text: err instanceof ApiError ? err.message : "Please contact support — don't pay again.",
              });
            }
            setCheckingOut(false);
            await loadOrders(workspaceId);
            pingNotifications();
          },
          modal: {
            // Closed the payment window without paying.
            ondismiss: async () => {
              setCheckingOut(false);
              if (lastFailure) {
                await api.recordOrderOutcome(order.order_id, "failed").catch(() => {});
                setStatus({ kind: "failed", title: "Payment failed", text: `${lastFailure} Nothing was charged — you can try again.` });
              } else {
                await api.recordOrderOutcome(order.order_id, "cancelled").catch(() => {});
                setStatus({ kind: "cancelled", title: "Payment cancelled", text: "You closed the payment window, so nothing was charged." });
              }
              setCheckoutPlan(null);
              await loadOrders(workspaceId);
              pingNotifications();
            },
          },
        });
        rzp.on("payment.failed", (resp) => {
          lastFailure = resp?.error?.description ? `${resp.error.description}.` : "The bank or card was declined.";
        });
        rzp.open();
        return; // leave checkingOut true until the modal's handler/ondismiss fires
      }
    } catch (err) {
      failure = err instanceof ApiError ? err.message : "Couldn't start checkout";
    }
    if (failure) {
      if (orderId) await api.recordOrderOutcome(orderId, "failed").catch(() => {});
      setStatus({ kind: "failed", title: "Couldn't start the payment", text: failure });
    }
    setCheckingOut(false);
  }

  // Customers only ever see plans the platform has published. Editing plans,
  // gateway keys and GST details lives in the Super Admin console.
  const visiblePlans = plans.filter((p) => p.is_active);

  return (
    <div className="max-w-[1240px] mx-auto grid grid-cols-1 md:grid-cols-[248px_1fr] gap-5 items-start">
      <WorkspaceSidebar
        workspaceName={workspaceName}
        active="/dashboard/billing"
        workspaces={workspaces}
        currentWorkspaceId={workspaceId ?? undefined}
      />

      <main className="min-w-0">
        <div className="flex justify-between items-start mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-[26px] font-semibold font-display">Billing &amp; plan</h1>
            <p className="text-[13px] text-fg-muted mt-1">
              Pick the plan that fits, upgrade any time, and download GST invoices for every payment.
            </p>
          </div>
          <ProfileMenu email={email} />
        </div>

        {isSuperAdmin && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-accent-soft px-4 py-3 text-[13px] text-accent-ink">
            <span>You&apos;re a platform super admin — plans, payment gateways and GST details are managed in the Super Admin console.</span>
            <Link href="/staff/billing" className="font-semibold underline underline-offset-2">Open Plans &amp; payments →</Link>
          </div>
        )}

        {error && <div role="alert" className="text-[13px] text-danger bg-danger-soft rounded-lg p-3 mb-4">{error}</div>}
        {status && (
          <div
            role={status.kind === "success" ? "status" : "alert"}
            className={`page-enter mb-5 flex items-start gap-3 rounded-2xl border p-4 ${STATUS_STYLE[status.kind].box}`}
          >
            <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-current/15 text-[13px] font-bold">
              {STATUS_STYLE[status.kind].icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">{status.title}</div>
              <div className="mt-0.5 text-[13px] opacity-90">{status.text}</div>
            </div>
            <button type="button" onClick={() => setStatus(null)} aria-label="Dismiss" className="text-[18px] leading-none opacity-70 hover:opacity-100">×</button>
          </div>
        )}

        {loading && <p className="text-fg-muted text-sm">Loading…</p>}

        {usage && <UsageCard usage={usage} />}

        {!loading && (
          <>
            <h2 className="mb-3 font-display text-[18px] font-semibold">Available plans</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {visiblePlans.map((p) => {
                const current = usage?.plan_id === p.plan_id;
                return (
                  <div
                    key={p.plan_id}
                    className={`lift bg-surface border rounded-2xl shadow-card p-5 flex flex-col ${current ? "border-accent ring-1 ring-accent" : "border-border"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-[18px] font-semibold">{p.name}</h3>
                      {current && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-accent-ink bg-accent-soft rounded-full px-2 py-0.5">
                          Current plan
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[24px] font-semibold tabular">{p.price_text || "—"}</div>
                    <p className="mt-1 text-[13px] text-fg-muted">{p.tagline}</p>
                    <ul className="mt-4 space-y-2 flex-1">
                      {p.features.map((f, i) => (
                        <li key={i} className="text-[13px] text-fg flex gap-2">
                          <span className="text-success">✓</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-5 pt-4 border-t border-border">
                      {current ? (
                        <div className="text-center text-[13px] font-semibold text-fg-muted py-2">You&apos;re on this plan</div>
                      ) : p.purchasable ? (
                        <button
                          onClick={() => startCheckout(p)}
                          disabled={availableGateways.length === 0 || !canManageBilling}
                          className="w-full bg-accent text-white rounded-btn py-2.5 text-[13.5px] font-semibold shadow-card hover:brightness-90 active:scale-[0.98] transition-all disabled:opacity-50"
                          title={
                            !canManageBilling
                              ? "Only a workspace owner or admin can subscribe"
                              : availableGateways.length === 0 ? "No payment gateway is configured yet" : undefined
                          }
                        >
                          {canManageBilling ? "Subscribe" : "Ask an admin to subscribe"}
                        </button>
                      ) : (
                        <a
                          href="/contact"
                          className="block text-center w-full border border-border rounded-btn py-2.5 text-[13.5px] font-semibold text-fg hover:bg-surface-2 transition-colors"
                        >
                          Contact sales
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}

              {visiblePlans.length === 0 && (
                <div className="col-span-full bg-surface border border-border rounded-2xl shadow-card p-5">
                  <p className="text-[13px] text-fg-muted">No plans published yet — check back soon.</p>
                </div>
              )}
            </div>
          </>
        )}

        {canManageBilling && !loading && (
          <section className="mt-10">
            <h2 className="font-display text-[18px] font-semibold">Your billing details</h2>
            <p className="mb-3 mt-1 text-[12.5px] text-fg-muted">
              Company, GST and contact details printed on your invoices. Only workspace owners and admins can see or change these.
            </p>
            <form onSubmit={saveDetails} noValidate className="max-w-2xl space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
              {Object.keys(detailErrors).length > 0 && (
                <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
                  Please fix the highlighted fields.
                </div>
              )}
              <BillingForm values={details} onChange={onDetailsChange} errors={detailErrors} idPrefix="bd" disabled={savingDetails} />
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={savingDetails}
                  className="rounded-btn bg-accent px-5 py-2 text-[13px] font-semibold text-white shadow-card transition-all hover:brightness-90 active:scale-[0.98] disabled:opacity-50"
                >
                  {savingDetails ? "Saving…" : "Save billing details"}
                </button>
                {detailsNotice && <span role="status" className="text-[12.5px] text-success">{detailsNotice}</span>}
              </div>
            </form>
          </section>
        )}

        {checkoutPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !checkingOut && setCheckoutPlan(null)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Subscribe to ${checkoutPlan.name}`}
              className="page-enter bg-surface border border-border rounded-2xl shadow-card p-5 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <h3 className="font-display text-[18px] font-semibold">Subscribe to {checkoutPlan.name}</h3>
                <p className="text-[12.5px] text-fg-muted mt-0.5">
                  {checkoutPlan.price_text} &middot; billed via {availableGateways.map((g) => g.name).join(" or ")}
                </p>
              </div>

              {availableGateways.length === 0 ? (
                <p className="text-[13px] text-danger">No payment gateway is configured yet — contact support.</p>
              ) : (
                <>
                  <p className="text-[12px] text-fg-muted">
                    These details go on your GST invoice. Fields marked <span className="text-danger">*</span> are required before you can pay.
                  </p>
                  {Object.keys(detailErrors).length > 0 && (
                    <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
                      Please fix the highlighted fields to continue.
                    </div>
                  )}
                  <BillingForm values={details} onChange={onDetailsChange} errors={detailErrors} idPrefix="co" disabled={checkingOut} />

                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    {availableGateways.map((g) => (
                      <button
                        key={g.code}
                        onClick={() => pay(g.code)}
                        disabled={checkingOut}
                        className="flex-1 bg-accent text-white rounded-btn py-2.5 text-[13.5px] font-semibold hover:brightness-90 active:scale-[0.98] transition-all disabled:opacity-50"
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

        {orders.length > 0 && (
          <>
            <h2 className="mt-10 mb-3 font-display text-[18px] font-semibold">Orders &amp; invoices</h2>
            <div className="bg-surface border border-border rounded-2xl shadow-card overflow-x-auto">
              <table className="w-full text-[13px] border-collapse min-w-[420px]">
                <thead className="bg-surface-2 text-left">
                  <tr>
                    <th className="p-3 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Date</th>
                    <th className="p-3 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Amount</th>
                    <th className="p-3 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Status</th>
                    <th className="p-3 text-[11px] uppercase tracking-wide text-fg-faint font-semibold">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.order_id} className="border-t border-border">
                      <td className="p-3">{new Date(o.created_at).toLocaleDateString()}</td>
                      <td className="p-3 tabular">{o.currency} {o.amount.toFixed(2)}</td>
                      <td className="p-3">
                        <span
                          className={`text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${(ORDER_STATUS[o.status] ?? ORDER_STATUS.created).cls}`}
                        >
                          {(ORDER_STATUS[o.status] ?? ORDER_STATUS.created).label}
                        </span>
                      </td>
                      <td className="p-3">
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
      </main>
    </div>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const near = limit !== null && used >= limit;
  return (
    <div>
      <div className="flex justify-between text-[12px] text-fg-muted mb-1">
        <span>{label}</span>
        <span className="tabular">{limit === null ? `${used} (unlimited)` : `${used} / ${limit}`}</span>
      </div>
      {limit !== null && (
        <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div className={`h-full rounded-full ${near ? "bg-danger" : "bg-accent"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function UsageCard({ usage }: { usage: Usage }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-5 mb-7">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-display text-[17px] font-semibold">
          {usage.on_trial ? "Free trial" : usage.plan_name || "Current plan"}
        </h3>
        {usage.on_trial && usage.trial_ends_at && (
          <span className="text-[11px] font-bold uppercase tracking-wide text-accent-ink bg-accent-soft rounded-full px-2 py-0.5">
            Ends {new Date(usage.trial_ends_at).toLocaleDateString()}
          </span>
        )}
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        <UsageBar label="Messages this month" used={usage.messages.used} limit={usage.messages.limit} />
        <UsageBar label="Indexed pages" used={usage.pages.used} limit={usage.pages.limit} />
        <UsageBar label="Uploaded files" used={usage.files.used} limit={usage.files.limit} />
        <UsageBar label="Team seats" used={usage.seats.used} limit={usage.seats.limit} />
      </div>
    </div>
  );
}
