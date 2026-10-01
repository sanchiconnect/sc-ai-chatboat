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
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="bg-surface text-fg border border-border rounded-xl shadow-card p-8 w-full max-w-sm text-center space-y-4">
        {status === "loading" && <p className="text-fg-muted">Verifying…</p>}
        {status === "ok" && (
          <>
            <h1 className="text-xl font-bold">Email verified</h1>
            <p className="text-sm text-fg-muted">You&apos;re all set.</p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-xl font-bold text-danger">Verification failed</h1>
            <p className="text-sm text-fg-muted">{error}</p>
          </>
        )}
        <Link href="/login" className="inline-block text-accent-ink underline underline-offset-2 text-sm">
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
