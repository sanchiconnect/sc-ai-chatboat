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
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={onSubmit} className="bg-white text-gray-900 rounded-xl shadow p-8 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold">Create your account</h1>
        <p className="text-sm text-gray-500">Free for 14 days. No card needed.</p>

        {error && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}

        <div>
          <label className="text-sm font-medium">Business name</label>
          <input
            className="mt-1 w-full border rounded-lg px-3 py-2"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Sharma Organics"
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium">Work email</label>
          <input
            className="mt-1 w-full border rounded-lg px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium">Password</label>
          <PasswordInput value={password} onChange={setPassword} required minLength={8} autoComplete="new-password" />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white rounded-lg py-2 font-medium disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>

        <p className="text-sm text-center text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-600">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
