"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Status = "loading" | "ok" | "error";

export default function VerifyEmailConfirmPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const uid = useMemo(() => sp.get("uid") || "", [sp]);
  const token = useMemo(() => sp.get("token") || "", [sp]);
  const verifyCode = useMemo(() => sp.get("verify_code") || sp.get("code") || "", [sp]);
  const nextFromQuery = useMemo(() => sp.get("next") || "", [sp]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const nextTarget =
    nextFromQuery ||
    (() => {
      if (typeof window === "undefined") return "/dashboard";
      try {
        return window.sessionStorage.getItem("auth_next") || "/dashboard";
      } catch {
        return "/dashboard";
      }
    })();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!verifyCode && (!uid || !token)) {
        setStatus("error");
        setError("Invalid verification link.");
        return;
      }
      try {
        const payload = verifyCode
          ? { verify_code: verifyCode }
          : { uid, token };

        const r = await fetch("/api/auth/verify-email/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) {
          let msg = "Verification failed";
          try {
            const j = await r.json();
            msg = j?.error || j?.detail || msg;
          } catch {}
          if (!cancelled) {
            setStatus("error");
            setError(msg);
          }
          return;
        }
        if (!cancelled) {
          setStatus("ok");
          try {
            window.sessionStorage.removeItem("auth_next");
          } catch {}
          router.replace(nextTarget);
          router.refresh();
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Verification failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nextTarget, router, token, uid, verifyCode]);

  return (
    <div className="max-w-md mx-auto mt-16 bg-white p-6 rounded-lg shadow space-y-4">
      <h1 className="text-xl font-semibold">Email verification</h1>
      {status === "loading" && <p className="text-sm text-gray-700">Verifying your account...</p>}
      {status === "ok" && <p className="text-sm text-green-700">Verified. Redirecting...</p>}
      {status === "error" && (
        <>
          <p className="text-sm text-red-600">{error || "Verification failed"}</p>
          <p className="text-sm text-gray-600">
            You can request another link from <Link href="/register/verify" className="underline">verification page</Link>.
          </p>
          <p className="text-sm text-gray-600">
            Or go to{" "}
            <Link href={nextTarget ? `/login?next=${encodeURIComponent(nextTarget)}` : "/login"} className="underline">
              Log in
            </Link>.
          </p>
        </>
      )}
    </div>
  );
}
