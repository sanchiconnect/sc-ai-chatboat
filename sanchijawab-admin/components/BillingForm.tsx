"use client";

import { useEffect, useMemo, useState } from "react";

// The country/state/city data is large, so it is loaded on demand (only when a
// billing form is actually on screen) instead of shipping in every page.
type Csc = typeof import("country-state-city");

export type BillingValues = {
  name: string; gstin: string; address: string; country: string; state: string; city: string;
  pincode: string; phone_country_code: string; phone: string;
};
export type BillingErrors = Partial<Record<keyof BillingValues, string>>;

export const EMPTY_BILLING: BillingValues = {
  name: "", gstin: "", address: "", country: "India", state: "", city: "",
  pincode: "", phone_country_code: "+91", phone: "",
};

// Same rules as the server (app/services/payments/billing_validation.py) — the
// server re-checks everything, this just tells the person what to fix sooner.
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const IN_PIN_RE = /^\d{6}$/;
const OTHER_PIN_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/;

const REQUIRED: { key: keyof BillingValues; label: string }[] = [
  { key: "name", label: "Billing name" },
  { key: "address", label: "Address" },
  { key: "country", label: "Country" },
  { key: "state", label: "State" },
  { key: "city", label: "City" },
  { key: "pincode", label: "Pincode" },
];

// Field order on screen, used to focus the first field with a problem.
export const FIELD_ORDER: (keyof BillingValues)[] = [
  "name", "gstin", "address", "country", "state", "city", "pincode", "phone_country_code", "phone",
];

export function validateBilling(v: BillingValues): BillingErrors {
  const errors: BillingErrors = {};
  for (const { key, label } of REQUIRED) {
    if (!v[key].trim()) errors[key] = `${label} is required`;
  }
  const isIndia = v.country.trim().toLowerCase() === "india";
  if (v.pincode.trim() && !errors.pincode) {
    if (isIndia && !IN_PIN_RE.test(v.pincode.trim())) errors.pincode = "Enter a 6-digit pincode";
    if (!isIndia && !OTHER_PIN_RE.test(v.pincode.trim())) errors.pincode = "Enter a valid postal code";
  }
  if (!/^\+\d{1,4}$/.test(v.phone_country_code.trim())) errors.phone_country_code = "Choose a country code";
  const digits = v.phone.replace(/\D/g, "");
  if (!digits) errors.phone = "Mobile number is required";
  else if (digits.length < 6 || digits.length > 14) errors.phone = "Enter a valid mobile number";
  if (v.gstin.trim() && (!isIndia || !GSTIN_RE.test(v.gstin.trim().toUpperCase()))) {
    errors.gstin = "Enter a valid 15-character GSTIN (Indian businesses only), or leave it blank";
  }
  return errors;
}

export function focusFirstError(errors: BillingErrors, idPrefix: string) {
  const first = FIELD_ORDER.find((f) => errors[f]);
  if (first) document.getElementById(`${idPrefix}-${first}`)?.focus();
}

const DIAL_LABEL_OVERRIDES: Record<string, string> = {
  "+1": "US / Canada", "+7": "Russia / Kazakhstan", "+44": "United Kingdom", "+61": "Australia",
  "+212": "Morocco", "+358": "Finland", "+590": "Guadeloupe",
};

function dialOf(phonecode: string): string {
  const first = String(phonecode).replace(/^\+/, "").split("-")[0].trim();
  return first ? `+${first}` : "";
}

const base = "w-full border bg-surface-2 rounded-lg px-3 py-2 text-[13px] text-fg disabled:opacity-60";

function Field({
  id, label, required, error, children, hint,
}: { id: string; label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-[12.5px] font-medium">
        {label}
        {required ? <span className="text-danger" aria-hidden="true"> *</span> : <span className="text-fg-faint font-normal"> (optional)</span>}
      </label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-[12px] text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11.5px] text-fg-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export function BillingForm({
  values, onChange, errors, idPrefix, disabled, nameLabel = "Billing name (company or person)",
  gstinHint = "Indian businesses only. Leave blank for a personal (non-business) invoice.",
}: {
  values: BillingValues;
  onChange: (next: BillingValues) => void;
  errors: BillingErrors;
  idPrefix: string;
  disabled?: boolean;
  nameLabel?: string;
  gstinHint?: string;
}) {
  const [csc, setCsc] = useState<Csc | null>(null);
  useEffect(() => {
    let live = true;
    import("country-state-city").then((m) => live && setCsc(m));
    return () => { live = false; };
  }, []);

  const countries = useMemo(() => csc?.Country.getAllCountries() ?? [], [csc]);
  const country = countries.find((c) => c.name === values.country);
  const states = useMemo(() => (csc && country ? csc.State.getStatesOfCountry(country.isoCode) : []), [csc, country]);
  const state = states.find((s) => s.name === values.state);
  const cities = useMemo(
    () => (csc && country && state ? csc.City.getCitiesOfState(country.isoCode, state.isoCode) : []),
    [csc, country, state],
  );

  const dialCodes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of countries) {
      const code = dialOf(c.phonecode);
      if (code && !seen.has(code)) seen.set(code, DIAL_LABEL_OVERRIDES[code] ?? c.name);
    }
    return [...seen.entries()].sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)));
  }, [countries]);

  const set = (patch: Partial<BillingValues>) => onChange({ ...values, ...patch });
  const cls = (key: keyof BillingValues) =>
    `${base} ${errors[key] ? "border-danger ring-1 ring-danger" : "border-border"}`;
  const a11y = (key: keyof BillingValues) => ({
    "aria-invalid": errors[key] ? (true as const) : undefined,
    "aria-describedby": errors[key] ? `${idPrefix}-${key}-error` : undefined,
  });

  function changeCountry(name: string) {
    const next = countries.find((c) => c.name === name);
    set({ country: name, state: "", city: "", phone_country_code: next ? dialOf(next.phonecode) || values.phone_country_code : values.phone_country_code });
  }

  return (
    <div className="space-y-3">
      <Field id={`${idPrefix}-name`} label={nameLabel} required error={errors.name}>
        <input id={`${idPrefix}-name`} disabled={disabled} className={cls("name")} autoComplete="organization" value={values.name}
          onChange={(e) => set({ name: e.target.value })} {...a11y("name")} />
      </Field>

      <Field id={`${idPrefix}-gstin`} label="GSTIN" error={errors.gstin} hint={gstinHint}>
        <input id={`${idPrefix}-gstin`} disabled={disabled} className={`${cls("gstin")} uppercase`} maxLength={15} value={values.gstin}
          onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} {...a11y("gstin")} />
      </Field>

      <Field id={`${idPrefix}-address`} label="Address" required error={errors.address}>
        <input id={`${idPrefix}-address`} disabled={disabled} className={cls("address")} autoComplete="street-address" value={values.address}
          onChange={(e) => set({ address: e.target.value })} {...a11y("address")} />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id={`${idPrefix}-country`} label="Country" required error={errors.country}>
          <select id={`${idPrefix}-country`} disabled={disabled || !csc} className={cls("country")} value={values.country}
            onChange={(e) => changeCountry(e.target.value)} {...a11y("country")}>
            {!csc && <option value={values.country}>{values.country || "Loading…"}</option>}
            {csc && <option value="">Select country</option>}
            {countries.map((c) => <option key={c.isoCode} value={c.name}>{c.name}</option>)}
          </select>
        </Field>

        <Field id={`${idPrefix}-state`} label="State / province" required error={errors.state}>
          <select id={`${idPrefix}-state`} disabled={disabled || !csc || !country} className={cls("state")} value={values.state}
            onChange={(e) => set({ state: e.target.value, city: "" })} {...a11y("state")}>
            <option value="">{country ? "Select state" : "Select a country first"}</option>
            {values.state && !state && <option value={values.state}>{values.state}</option>}
            {states.map((s) => <option key={s.isoCode} value={s.name}>{s.name}</option>)}
          </select>
        </Field>

        <Field id={`${idPrefix}-city`} label="City" required error={errors.city}>
          {cities.length > 0 ? (
            <select id={`${idPrefix}-city`} disabled={disabled} className={cls("city")} value={values.city}
              onChange={(e) => set({ city: e.target.value })} {...a11y("city")}>
              <option value="">Select city</option>
              {values.city && !cities.some((c) => c.name === values.city) && <option value={values.city}>{values.city}</option>}
              {cities.map((c) => <option key={`${c.name}-${c.latitude}-${c.longitude}`} value={c.name}>{c.name}</option>)}
            </select>
          ) : (
            <input id={`${idPrefix}-city`} disabled={disabled || !values.state} className={cls("city")} autoComplete="address-level2"
              placeholder={values.state ? "Type your city" : "Select a state first"} value={values.city}
              onChange={(e) => set({ city: e.target.value })} {...a11y("city")} />
          )}
        </Field>

        <Field id={`${idPrefix}-pincode`} label="Pincode / postal code" required error={errors.pincode}>
          <input id={`${idPrefix}-pincode`} disabled={disabled} className={cls("pincode")} autoComplete="postal-code"
            inputMode={values.country === "India" ? "numeric" : "text"} maxLength={values.country === "India" ? 6 : 10} value={values.pincode}
            onChange={(e) => set({ pincode: values.country === "India" ? e.target.value.replace(/\D/g, "") : e.target.value })} {...a11y("pincode")} />
        </Field>
      </div>

      <Field id={`${idPrefix}-phone`} label="Mobile number" required error={errors.phone || errors.phone_country_code}>
        <div className="flex gap-2">
          <select id={`${idPrefix}-phone_country_code`} aria-label="Country code" disabled={disabled || !csc}
            className={`${cls("phone_country_code")} !w-[8.5rem] shrink-0`} value={values.phone_country_code}
            onChange={(e) => set({ phone_country_code: e.target.value })} {...a11y("phone_country_code")}>
            {!csc && <option value={values.phone_country_code}>{values.phone_country_code}</option>}
            {dialCodes.map(([code, name]) => <option key={code} value={code}>{`${code} ${name}`}</option>)}
          </select>
          <input id={`${idPrefix}-phone`} disabled={disabled} type="tel" inputMode="tel" autoComplete="tel-national" maxLength={14}
            className={cls("phone")} value={values.phone} onChange={(e) => set({ phone: e.target.value.replace(/[^\d\s-]/g, "") })} {...a11y("phone")} />
        </div>
      </Field>
    </div>
  );
}
