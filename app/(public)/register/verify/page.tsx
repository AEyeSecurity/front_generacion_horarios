"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/use-i18n";

const MAX_RESENDS = 5;

function cooldownForAttempt(attempt: number) {
  if (attempt <= 1) return 5;
  if (attempt <= 4) return 30;
  return 60;
}

function formatSeconds(value: number) {
  const m = Math.floor(value / 60);
  const s = value % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function RegisterVerifyPage() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const initialEmail = useMemo(() => sp.get("email") || "", [sp]);
  const next = useMemo(() => sp.get("next") || "", [sp]);

  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(5);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const id = window.setInterval(() => {
      setCooldownRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownRemaining]);

  useEffect(() => {
    if (!next) return;
    try {
      window.sessionStorage.setItem("auth_next", next);
    } catch {
      // ignore storage failures
    }
  }, [next]);

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !email.trim() || cooldownRemaining > 0 || resendCount >= MAX_RESENDS) return;

    setLoading(true);
    try {
      await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setResendCount((prev) => {
        const nextAttempt = prev + 1;
        setCooldownRemaining(cooldownForAttempt(nextAttempt));
        return nextAttempt;
      });
    } catch {
      // keep silent in this view by design
    } finally {
      setLoading(false);
    }
  }

  const reachedMax = resendCount >= MAX_RESENDS;
  const isCoolingDown = cooldownRemaining > 0;
  const canResend = !loading && !isCoolingDown && !reachedMax && !!email.trim();

  return (
    <div className="max-w-md mx-auto mt-16 bg-white p-6 rounded-lg shadow space-y-4">
      <h1 className="text-xl font-semibold">{t("auth.verify_your_email")}</h1>
      <p className="text-sm text-gray-700">{t("auth.verify_email_instructions")}</p>

      <form onSubmit={resend} className="space-y-3">
        <div>
          <label className="block text-sm">{t("auth.email")}</label>
          <input
            className="border rounded w-full p-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col items-center">
          <button
            type="submit"
            disabled={!canResend}
            className="px-4 py-2 rounded border text-sm bg-black text-white hover:bg-black/90 disabled:bg-gray-200 disabled:text-gray-500 disabled:border-gray-300 disabled:cursor-not-allowed"
          >
            {loading
              ? t("auth.sending")
              : reachedMax
              ? t("auth.resend_limit_reached")
              : t("auth.resend_verification_email")}
          </button>
          {resendCount > 0 && isCoolingDown && (
            <div className="mt-1 text-[11px] text-gray-500 text-center">
              {t("auth.try_again_in", { time: formatSeconds(cooldownRemaining) })}
            </div>
          )}
        </div>
      </form>

      <p className="text-sm text-gray-600">
        {t("auth.already_verified_prompt")}{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="underline">
          {t("auth.log_in")}
        </Link>
      </p>
    </div>
  );
}
