"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { detectPreferredLanguageFromNavigator } from "@/lib/language";
import { useI18n } from "@/lib/use-i18n";

export default function LoginForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setP] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sp = useSearchParams();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const preferredLanguage = detectPreferredLanguageFromNavigator();
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, preferred_language: preferredLanguage }),
    });
    if (!res.ok) {
      const { error: apiError } = await res.json().catch(() => ({ error: t("auth.login_failed") }));
      setError(apiError || t("auth.login_failed"));
      return;
    }
    const nextFromQuery = sp.get("next") || "";
    const nextFromStorage = (() => {
      try {
        return window.sessionStorage.getItem("auth_next") || "";
      } catch {
        return "";
      }
    })();
    const next = nextFromQuery || nextFromStorage || "/dashboard";
    try {
      window.sessionStorage.removeItem("auth_next");
    } catch {
      // ignore storage failures
    }
    router.replace(next);
    router.refresh();
  }

  const registered = sp.get("registered");
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {registered && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
          {t("auth.account_created_sign_in")}
        </div>
      )}
      <div>
        <label className="block text-sm">{t("auth.email")}</label>
        <input
          suppressHydrationWarning
          className="border rounded w-full p-2"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm">{t("auth.password")}</label>
        <input
          suppressHydrationWarning
          className="border rounded w-full p-2"
          type="password"
          value={password}
          onChange={(e) => setP(e.target.value)}
        />
        <div className="mt-1 text-right leading-none">
          <Link
            href={email ? `/password-reset?email=${encodeURIComponent(email)}` : "/password-reset"}
            className="text-[11px] text-gray-500 underline hover:text-gray-800"
          >
            {t("auth.forgot_password")}
          </Link>
        </div>
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <button className="px-4 py-2 rounded bg-black text-white">{t("auth.login")}</button>
    </form>
  );
}
