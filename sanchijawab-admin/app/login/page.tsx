"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, setToken, ApiError } from "@/lib/api";
import { PasswordInput } from "@/components/PasswordInput";

export default function LoginPage() {
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
      const res = await api.login(email, password);
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
      <form onSubmit={onSubmit} className="bg-surface text-fg border border-border rounded-xl shadow-card p-8 w-full max-w-sm">
      <fieldset disabled={loading} className="m-0 min-w-0 space-y-4 border-0 p-0">
        <h1 className="text-xl font-bold">Log in</h1>

        {error && <div className="text-sm text-danger bg-danger-soft rounded p-2">{error}</div>}

        <div>
          <label htmlFor="login-email" className="text-sm font-medium">Email</label>
          <input
            id="login-email"
            className="mt-1 w-full border border-border bg-surface text-fg rounded-lg px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="login-password" className="text-sm font-medium">Password</label>
          <PasswordInput id="login-password" value={password} onChange={setPassword} required autoComplete="current-password" />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent text-white rounded-lg py-2 font-medium hover:brightness-90 transition-[filter] disabled:opacity-50"
        >
          {loading ? "Logging in…" : "Log in"}
        </button>

        <p className="text-sm text-center text-fg-muted">
          No account?{" "}
          <Link href="/signup" className="text-accent-ink underline underline-offset-2">
            Sign up
          </Link>
        </p>
      </fieldset>
      </form>
    </div>
  );
}
