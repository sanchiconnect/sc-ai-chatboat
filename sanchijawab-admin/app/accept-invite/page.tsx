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
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={onSubmit} className="bg-white text-gray-900 rounded-xl shadow p-8 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold">Accept invitation</h1>
        <p className="text-sm text-gray-500">Set a password to activate your account.</p>

        {error && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}

        <div>
          <label className="text-sm font-medium">Password</label>
          <PasswordInput value={password} onChange={setPassword} required minLength={8} autoComplete="new-password" />
        </div>

        <button
          type="submit"
          disabled={loading || !token}
          className="w-full bg-indigo-600 text-white rounded-lg py-2 font-medium disabled:opacity-50"
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
