"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/use-i18n";

type Status = "loading" | "ok" | "error";

export default function VerifyEmailConfirmPage() {
  const { t } = useI18n();
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
        setError(t("verify_email_confirm.invalid_link"));
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
          let msg = t("verify_email_confirm.verification_failed");
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
          setError(err instanceof Error ? err.message : t("verify_email_confirm.verification_failed"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nextTarget, router, token, uid, verifyCode, t]);

  return (
    <div className="max-w-md mx-auto mt-16 bg-white p-6 rounded-lg shadow space-y-4">
      <h1 className="text-xl font-semibold">{t("verify_email_confirm.title")}</h1>
      {status === "loading" && <p className="text-sm text-gray-700">{t("verify_email_confirm.verifying")}</p>}
      {status === "ok" && <p className="text-sm text-green-700">{t("verify_email_confirm.verified_redirecting")}</p>}
      {status === "error" && (
        <>
          <p className="text-sm text-red-600">{error || t("verify_email_confirm.verification_failed")}</p>
          <p className="text-sm text-gray-600">
            {t("verify_email_confirm.request_another_link_from")}{" "}
            <Link href="/register/verify" className="underline">
              {t("verify_email_confirm.verification_page")}
            </Link>
            .
          </p>
          <p className="text-sm text-gray-600">
            {t("verify_email_confirm.or_go_to")}{" "}
            <Link href={nextTarget ? `/login?next=${encodeURIComponent(nextTarget)}` : "/login"} className="underline">
              {t("verify_email_confirm.log_in")}
            </Link>.
          </p>
        </>
      )}
    </div>
  );
}
