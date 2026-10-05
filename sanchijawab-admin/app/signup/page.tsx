"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, setToken, ApiError } from "@/lib/api";
import { PasswordInput } from "@/components/PasswordInput";

export default function SignupPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.signup(email, password, businessName);
      setToken(res.access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <form onSubmit={onSubmit} className="bg-surface text-fg border border-border rounded-xl shadow-card p-8 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold">Create your account</h1>
        <p className="text-sm text-fg-muted">Free for 14 days. No card needed.</p>

        {error && <div className="text-sm text-danger bg-danger-soft rounded p-2">{error}</div>}

        <div>
          <label htmlFor="signup-business" className="text-sm font-medium">Business name</label>
          <input
            id="signup-business"
            className="mt-1 w-full border border-border bg-surface text-fg rounded-lg px-3 py-2"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Sharma Organics"
            required
          />
        </div>
        <div>
          <label htmlFor="signup-email" className="text-sm font-medium">Work email</label>
          <input
            id="signup-email"
            className="mt-1 w-full border border-border bg-surface text-fg rounded-lg px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            required
          />
        </div>
        <div>
          <label htmlFor="signup-password" className="text-sm font-medium">Password</label>
          <PasswordInput id="signup-password" value={password} onChange={setPassword} required minLength={8} autoComplete="new-password" allowGenerate />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent text-white rounded-lg py-2 font-medium hover:brightness-90 transition-[filter] disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>

        <p className="text-sm text-center text-fg-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent-ink underline underline-offset-2">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
