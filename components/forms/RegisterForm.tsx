"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { detectPreferredLanguageFromNavigator } from "@/lib/language";
import { useI18n } from "@/lib/use-i18n";

export default function RegisterForm() {
  const { t } = useI18n();
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      window.sessionStorage.removeItem("invite_auto_join_token");
    } catch {
      // ignore storage failures
    }
    const preferredLanguage = detectPreferredLanguageFromNavigator();
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          password,
          preferred_language: preferredLanguage,
        }),
      });
      if (!res.ok) {
        let msg = t("auth.registration_failed");
        try {
          const j = await res.json();
          msg = j?.error || msg;
        } catch {
          msg = `${res.status} ${res.statusText}`;
        }
        setError(msg);
        return;
      }

      const q = new URLSearchParams({ email });
      if (next) q.set("next", next);
      router.replace(`/register/verify?${q.toString()}`);
      router.refresh();
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : t("auth.registration_failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm">{t("auth.first_name")}</label>
          <input className="border rounded w-full p-2" value={firstName} onChange={(e) => setFirst(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm">{t("auth.last_name")}</label>
          <input className="border rounded w-full p-2" value={lastName} onChange={(e) => setLast(e.target.value)} required />
        </div>
      </div>
      <div>
        <label className="block text-sm">{t("auth.email")}</label>
        <input className="border rounded w-full p-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label className="block text-sm">{t("auth.password")}</label>
        <input className="border rounded w-full p-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <div className="text-red-600 text-sm whitespace-pre-wrap">{error}</div>}
      <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-50" disabled={loading}>
        {loading ? t("auth.creating_account") : t("auth.create_account")}
      </button>
    </form>
  );
}
