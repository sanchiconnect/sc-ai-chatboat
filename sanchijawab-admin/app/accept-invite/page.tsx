"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, setToken, ApiError } from "@/lib/api";
import { PasswordInput } from "@/components/PasswordInput";

function AcceptInviteInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("Missing invite token.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.acceptInvite(token, password);
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
        <h1 className="text-xl font-bold">Accept invitation</h1>
        <p className="text-sm text-fg-muted">Set a password to activate your account.</p>

        {error && <div className="text-sm text-danger bg-danger-soft rounded p-2">{error}</div>}

        <div>
          <label htmlFor="invite-password" className="text-sm font-medium">Password</label>
          <PasswordInput id="invite-password" value={password} onChange={setPassword} required minLength={8} autoComplete="new-password" allowGenerate />
        </div>

        <button
          type="submit"
          disabled={loading || !token}
          className="w-full bg-accent text-white rounded-lg py-2 font-medium hover:brightness-90 transition-[filter] disabled:opacity-50"
        >
          {loading ? "Setting password…" : "Accept & continue"}
        </button>
      </form>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteInner />
    </Suspense>
  );
}
