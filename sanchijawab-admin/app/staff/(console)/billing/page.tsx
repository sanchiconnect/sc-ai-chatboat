"use client";

import { useEffect, useState } from "react";
import {
  staffApi, StaffApiError, type StaffBillingProfile, type StaffGateway, type StaffPlan,
} from "@/lib/staff-api";
import {
  BillingForm, EMPTY_BILLING, focusFirstError, validateBilling,
  type BillingErrors, type BillingValues,
} from "@/components/BillingForm";

const LIMIT_FIELDS = [
  { key: "max_messages_per_month", label: "Messages / month" },
  { key: "max_pages", label: "Indexed pages" },
  { key: "max_files", label: "Uploaded files" },
  { key: "max_seats", label: "Team seats" },
] as const;
type LimitKey = (typeof LIMIT_FIELDS)[number]["key"];

const EMPTY_FORM = {
  name: "", price_text: "", tagline: "", featuresText: "", is_active: true, sort_order: 0,
  sale: "display" as "online" | "display", // buy online vs "Contact sales"
  amountText: "", currency: "INR",
  limitsText: { max_messages_per_month: "", max_pages: "", max_files: "", max_seats: "" } as Record<LimitKey, string>,
};

// The supplier's phone is stored as one string ("+91 9876543210"); the form edits the code and number separately.
function splitPhone(raw: string): { phone_country_code: string; phone: string } {
  const m = raw.trim().match(/^(\+\d{1,4})\s*(.*)$/);
  return m ? { phone_country_code: m[1], phone: m[2] } : { phone_country_code: "+91", phone: raw.trim() };
}

function supplierFromProfile(p: StaffBillingProfile): BillingValues {
  return {
    name: p.supplier_name, gstin: p.supplier_gstin, address: p.supplier_address,
    country: p.supplier_country || "India", state: p.supplier_state, city: p.supplier_city,
    pincode: p.supplier_pincode, ...splitPhone(p.supplier_phone),
  };
}

const inputCls = "w-full border border-border bg-surface-2 rounded-lg px-3 py-2 text-[13px]";

function formFromPlan(p: StaffPlan) {
  return {
    name: p.name, price_text: p.price_text, tagline: p.tagline,
    featuresText: p.features.join("\n"), is_active: p.is_active, sort_order: p.sort_order,
    sale: (p.amount === null ? "display" : "online") as "online" | "display",
    amountText: p.amount === null ? "" : String(p.amount), currency: p.currency,
    limitsText: Object.fromEntries(
      LIMIT_FIELDS.map((l) => [l.key, p.limits?.[l.key] == null ? "" : String(p.limits[l.key])]),
    ) as Record<LimitKey, string>,
  };
}

export default function StaffBillingPage() {
  const [plans, setPlans] = useState<StaffPlan[]>([]);
  const [gateways, setGateways] = useState<StaffGateway[]>([]);
  const [gatewayForms, setGatewayForms] = useState<Record<string, Record<string, string | boolean>>>({});
  const [supplier, setSupplier] = useState<BillingValues>(EMPTY_BILLING);
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierErrors, setSupplierErrors] = useState<BillingErrors>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [savingGateway, setSavingGateway] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  function fail(err: unknown, fallback: string) {
    setError(err instanceof StaffApiError ? err.message : fallback);
  }

  async function loadPlans() {
    try {
      setPlans(await staffApi.listPlans());
    } catch (err) {
      fail(err, "Failed to load plans");
    }
  }

  useEffect(() => {
    Promise.all([
      loadPlans(),
      staffApi.listGateways().then(setGateways).catch((e) => fail(e, "Failed to load gateways")),
      staffApi.getBillingProfile().then((p) => {
        setSupplier(supplierFromProfile(p));
        setSupplierEmail(p.supplier_email);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(text: string) {
    setNotice(text);
    setTimeout(() => setNotice(null), 2500);
  }

  function startEdit(p: StaffPlan) {
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
    if (form.sale === "online" && !(Number(amountTrimmed) > 0)) {
      setError("A plan customers can buy online needs a billable amount above 0.");
      setSaving(false);
      return;
    }
    const body = {
      name: form.name,
      price_text: form.price_text,
      tagline: form.tagline,
      features: form.featuresText.split("\n").map((f) => f.trim()).filter(Boolean),
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 0,
      currency: form.currency,
      limits: Object.fromEntries(
        LIMIT_FIELDS.map((l) => [l.key, form.limitsText[l.key].trim() === "" ? null : Number(form.limitsText[l.key])]),
      ),
      ...(form.sale === "online" ? { amount: Number(amountTrimmed) } : { amount: null, clear_amount: true }),
    };
    try {
      if (creating) await staffApi.createPlan(body);
      else if (editingId) await staffApi.updatePlan(editingId, body);
      cancelEdit();
      await loadPlans();
      flash("Plan saved.");
    } catch (err) {
      fail(err, "Failed to save plan");
    } finally {
      setSaving(false);
    }
  }

  async function removePlan(p: StaffPlan) {
    if (!window.confirm(`Delete the "${p.name}" plan? This can't be undone.`)) return;
    setError(null);
    try {
      await staffApi.deletePlan(p.plan_id);
      await loadPlans();
    } catch (err) {
      fail(err, "Failed to delete plan");
    }
  }

  function gwValue(code: string, field: string, fallback: string) {
    return (gatewayForms[code]?.[field] as string | undefined) ?? fallback;
  }
  function setGw(code: string, field: string, value: string | boolean) {
    setGatewayForms((prev) => ({ ...prev, [code]: { ...prev[code], [field]: value } }));
  }

  async function saveGateway(code: string) {
    setSavingGateway(code);
    setError(null);
    const f = gatewayForms[code] || {};
    try {
      const updated = await staffApi.updateGateway(code, {
        test_client_id: f.test_client_id as string | undefined,
        test_client_secret: (f.test_client_secret as string) || undefined,
        live_client_id: f.live_client_id as string | undefined,
        live_client_secret: (f.live_client_secret as string) || undefined,
        enabled: f.enabled as boolean | undefined,
      });
      setGateways((gs) => gs.map((g) => (g.code === code ? updated : g)));
      setGatewayForms((prev) => ({ ...prev, [code]: {} }));
      flash("Gateway saved.");
    } catch (err) {
      fail(err, "Failed to save gateway");
    } finally {
      setSavingGateway(null);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateBilling(supplier);
    setSupplierErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstError(errors, "sp");
      return;
    }
    setSavingProfile(true);
    setError(null);
    try {
      await staffApi.updateBillingProfile({
        supplier_name: supplier.name, supplier_gstin: supplier.gstin, supplier_address: supplier.address,
        supplier_city: supplier.city, supplier_state: supplier.state, supplier_country: supplier.country,
        supplier_pincode: supplier.pincode, supplier_email: supplierEmail.trim(),
        supplier_phone: `${supplier.phone_country_code} ${supplier.phone.trim()}`,
      });
      flash("GST details saved.");
    } catch (err) {
      fail(err, "Failed to save GST details");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-[24px] font-semibold font-display">Plans &amp; payments</h1>
        <p className="text-[13px] text-fg-muted mt-1 max-w-2xl">
          Pricing plans, payment gateway keys and GST invoice details. Only platform staff can see or change this;
          customers just see the published plans on their own Billing page and on the public pricing page.
        </p>
      </div>

      {error && <div role="alert" className="text-[13px] text-danger bg-danger-soft rounded-lg p-3">{error}</div>}
      {notice && <div role="status" className="text-[13px] text-success bg-success-soft rounded-lg p-3">{notice}</div>}
      {loading && <p className="text-fg-muted text-sm">Loading…</p>}

      <section>
        <h2 className="mb-3 font-display text-[18px] font-semibold">Pricing plans</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div
              key={p.plan_id}
              className={`lift bg-surface border border-border rounded-2xl shadow-card p-5 flex flex-col ${p.is_active ? "" : "opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-[17px] font-semibold">{p.name}</h3>
                <div className="flex gap-1 flex-wrap justify-end">
                  {!p.is_active && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-fg-faint bg-surface-2 rounded-full px-2 py-0.5">Hidden</span>
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
              <div className="mt-4 flex gap-4 pt-3 border-t border-border">
                <button onClick={() => startEdit(p)} className="text-[12.5px] font-semibold text-accent-ink hover:underline">Edit</button>
                <button onClick={() => removePlan(p)} className="text-[12.5px] font-semibold text-danger hover:underline">Delete</button>
              </div>
            </div>
          ))}
          <button
            onClick={startCreate}
            className="border border-dashed border-border rounded-2xl p-5 flex items-center justify-center text-[13.5px] font-semibold text-fg-muted hover:text-accent-ink hover:border-accent transition-colors min-h-[160px]"
          >
            + Add a plan
          </button>
        </div>

        {(creating || editingId) && (
          <form onSubmit={savePlan} className="page-enter mt-5 bg-surface border border-border rounded-2xl shadow-card p-5 max-w-xl">
           {/* Locked while saving so nothing changes under a request that is in flight. */}
           <fieldset disabled={saving} className="m-0 min-w-0 space-y-3 border-0 p-0">
            <h3 className="font-display text-[16px] font-semibold">{creating ? "New plan" : "Edit plan"}</h3>
            {/* Whether customers can buy a plan online is only decided (and shown) here, while editing. */}
            <div>
              <label htmlFor="plan-sale" className="text-[12.5px] font-medium">How customers get this plan</label>
              <select
                id="plan-sale" className={`mt-1 ${inputCls}`} value={form.sale}
                onChange={(e) => setForm({ ...form, sale: e.target.value as "online" | "display" })}
              >
                <option value="online">Purchasable: customers can buy it online</option>
                <option value="display">Display only: customers see &quot;Contact sales&quot;</option>
              </select>
            </div>
            <div>
              <label className="text-[12.5px] font-medium">Name</label>
              <input required className={`mt-1 ${inputCls}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-[12.5px] font-medium">Price (display text, e.g. ₹2,999/mo)</label>
              <input className={`mt-1 ${inputCls}`} value={form.price_text} onChange={(e) => setForm({ ...form, price_text: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[12.5px] font-medium">Billable amount</label>
                <p className="text-[11px] text-fg-faint mb-1">
                  {form.sale === "online" ? "What the customer is charged (before GST)." : "Not used: this plan is display only."}
                </p>
                <input
                  type="number" step="0.01" min="0" disabled={form.sale === "display"}
                  className={`${inputCls} disabled:opacity-50`} placeholder="999.00"
                  value={form.sale === "display" ? "" : form.amountText}
                  onChange={(e) => setForm({ ...form, amountText: e.target.value })}
                />
              </div>
              <div className="w-24">
                <label className="text-[12.5px] font-medium">Currency</label>
                <input className={`mt-1 ${inputCls}`} maxLength={8} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
              </div>
            </div>
            <div>
              <label className="text-[12.5px] font-medium">Usage limits</label>
              <p className="text-[11px] text-fg-faint mb-1">Leave a box empty for unlimited. Enforced for workspaces on this plan.</p>
              <div className="grid grid-cols-2 gap-2">
                {LIMIT_FIELDS.map((l) => (
                  <label key={l.key} className="text-[12px] text-fg-muted">
                    {l.label}
                    <input
                      type="number" min={0} placeholder="Unlimited"
                      className={`mt-1 text-fg ${inputCls}`}
                      value={form.limitsText[l.key]}
                      onChange={(e) => setForm({ ...form, limitsText: { ...form.limitsText, [l.key]: e.target.value } })}
                    />
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[12.5px] font-medium">Tagline</label>
              <input className={`mt-1 ${inputCls}`} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
            </div>
            <div>
              <label className="text-[12.5px] font-medium">Features (one per line)</label>
              <textarea className={`mt-1 h-24 ${inputCls}`} value={form.featuresText} onChange={(e) => setForm({ ...form, featuresText: e.target.value })} />
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <label className="text-[12.5px] font-medium flex items-center gap-2">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                Visible on pricing page
              </label>
              <label className="text-[12.5px] font-medium flex items-center gap-2">
                Order
                <input type="number" className="w-16 border border-border bg-surface-2 rounded-lg px-2 py-1 text-[13px]" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="bg-accent text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50">
                {saving ? "Saving…" : "Save plan"}
              </button>
              <button type="button" onClick={cancelEdit} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-fg-muted hover:text-fg">Cancel</button>
            </div>
           </fieldset>
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-display text-[18px] font-semibold">Payment gateways</h2>
        <p className="text-[12.5px] text-fg-muted mb-3">
          Keys are encrypted at rest and never sent back to the browser once saved. Payments run in the mode set by
          <code className="mx-1">PAYMENT_MODE</code> in the backend settings (test until you switch it to live).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gateways.map((g) => (
            <div key={g.code} className="lift bg-surface border border-border rounded-2xl shadow-card p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-[16px] font-semibold">{g.name}</h3>
                <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${g.test_configured ? "text-success bg-success-soft" : "text-fg-faint bg-surface-2"}`}>
                  {g.test_configured ? "Test keys set" : "Not configured"}
                </span>
              </div>
              <fieldset disabled={savingGateway === g.code} className="m-0 min-w-0 space-y-2 border-0 p-0 mt-3">
                <input
                  className={inputCls} placeholder="Test client/key ID"
                  value={gwValue(g.code, "test_client_id", g.test_client_id)}
                  onChange={(e) => setGw(g.code, "test_client_id", e.target.value)}
                />
                <input
                  type="password" className={inputCls} autoComplete="off"
                  placeholder={g.test_configured ? "Test secret (leave blank to keep existing)" : "Test client secret"}
                  value={gwValue(g.code, "test_client_secret", "")}
                  onChange={(e) => setGw(g.code, "test_client_secret", e.target.value)}
                />
                <input
                  className={inputCls} placeholder="Live client/key ID"
                  value={gwValue(g.code, "live_client_id", g.live_client_id)}
                  onChange={(e) => setGw(g.code, "live_client_id", e.target.value)}
                />
                <input
                  type="password" className={inputCls} autoComplete="off"
                  placeholder={g.live_configured ? "Live secret (leave blank to keep existing)" : "Live client secret"}
                  value={gwValue(g.code, "live_client_secret", "")}
                  onChange={(e) => setGw(g.code, "live_client_secret", e.target.value)}
                />
              </fieldset>
              <label className="mt-3 flex items-center gap-2 text-[12.5px] font-medium text-fg">
                <input
                  type="checkbox"
                  checked={(gatewayForms[g.code]?.enabled as boolean | undefined) ?? g.enabled}
                  onChange={(e) => setGw(g.code, "enabled", e.target.checked)}
                />
                Enabled for checkout
              </label>
              <button
                onClick={() => saveGateway(g.code)}
                disabled={savingGateway === g.code}
                className="mt-3 bg-accent text-white rounded-lg px-4 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
              >
                {savingGateway === g.code ? "Saving…" : "Save"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 font-display text-[18px] font-semibold">GST / invoice details</h2>
        <p className="text-[12.5px] text-fg-muted mb-3">
          Your own registration details, printed on every invoice. Your state decides CGST + SGST (same state) vs IGST (different state).
        </p>
        <form onSubmit={saveProfile} noValidate className="bg-surface border border-border rounded-2xl shadow-card p-5 max-w-xl space-y-4">
          {Object.keys(supplierErrors).length > 0 && (
            <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">Please fix the highlighted fields.</div>
          )}
          <BillingForm
            values={supplier}
            onChange={(next) => {
              setSupplier(next);
              setSupplierErrors((prev) => {
                const kept: BillingErrors = {};
                (Object.keys(prev) as (keyof BillingValues)[]).forEach((k) => { if (next[k] === supplier[k]) kept[k] = prev[k]; });
                return kept;
              });
            }}
            errors={supplierErrors}
            idPrefix="sp"
            disabled={savingProfile}
            nameLabel="Legal / business name"
            gstinHint="Your 15-character GST registration number. It is printed on every tax invoice."
          />
          <div>
            <label htmlFor="sp-email" className="text-[12.5px] font-medium">Billing email <span className="text-fg-faint font-normal">(optional)</span></label>
            <input id="sp-email" type="email" disabled={savingProfile} className={`mt-1 ${inputCls} disabled:opacity-60`} value={supplierEmail} onChange={(e) => setSupplierEmail(e.target.value)} />
          </div>
          <button type="submit" disabled={savingProfile} className="bg-accent text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50">
            {savingProfile ? "Saving…" : "Save GST details"}
          </button>
        </form>
      </section>
    </div>
  );
}
