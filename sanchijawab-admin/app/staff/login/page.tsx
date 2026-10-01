"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { staffApi, setStaffToken, StaffApiError } from "@/lib/staff-api";

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await staffApi.login(email, password);
      setStaffToken(res.access_token);
      router.push("/staff");
    } catch (err) {
      setError(err instanceof StaffApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <form onSubmit={onSubmit} className="bg-surface text-fg border border-border rounded-xl shadow-card p-8 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2.5 pb-1">
          <div className="w-8 h-8 rounded-lg bg-fg text-bg flex items-center justify-center font-display font-semibold text-sm flex-none">
            S
          </div>
          <div>
            <div className="font-semibold text-sm leading-tight">SanchiJawab &middot; Super Admin</div>
            <div className="text-[11px] text-fg-faint leading-tight">Platform staff only</div>
          </div>
        </div>

        {error && <div className="text-sm text-danger bg-danger-soft rounded p-2">{error}</div>}

        <div>
          <label htmlFor="staff-email" className="text-sm font-medium">Email</label>
          <input
            id="staff-email"
            className="mt-1 w-full border border-border bg-surface text-fg rounded-lg px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label htmlFor="staff-password" className="text-sm font-medium">Password</label>
          <input
            id="staff-password"
            className="mt-1 w-full border border-border bg-surface text-fg rounded-lg px-3 py-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-fg text-bg rounded-lg py-2 font-medium hover:brightness-110 transition-[filter] disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-[11.5px] text-center text-fg-faint">
          This is a separate login from the customer dashboard. Only accounts with
          platform staff access can sign in here.
        </p>
      </form>
    </div>
  );
}
