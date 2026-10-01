"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Missing verification token.");
      return;
    }
    api
      .verifyEmail(token)
      .then(() => setStatus("ok"))
      .catch((err) => {
        setStatus("error");
        setError(err instanceof ApiError ? err.message : "Verification failed");
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-white text-gray-900 rounded-xl shadow p-8 w-full max-w-sm text-center space-y-4">
        {status === "loading" && <p className="text-gray-500">Verifying…</p>}
        {status === "ok" && (
          <>
            <h1 className="text-xl font-bold">Email verified</h1>
            <p className="text-sm text-gray-500">You're all set.</p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-xl font-bold text-red-600">Verification failed</h1>
            <p className="text-sm text-gray-500">{error}</p>
          </>
        )}
        <Link href="/login" className="inline-block text-indigo-600 text-sm">
          Go to login
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
