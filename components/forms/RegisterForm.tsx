"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getPasswordPolicyState, PasswordPolicyChecklist } from "@/components/forms/PasswordPolicyChecklist";
import { getGuidedAuthErrorMessage } from "@/lib/auth-error-messages";
import { detectPreferredLanguageFromNavigator } from "@/lib/language";
import { useI18n } from "@/lib/use-i18n";

export default function RegisterForm() {
  const { t } = useI18n();
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next");
  const passwordPolicy = getPasswordPolicyState(password);
  const passwordsMatch = password.length > 0 && password === passwordConfirm;
  const canSubmit = passwordPolicy.valid && passwordsMatch && !loading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError(passwordPolicy.valid ? t("auth.passwords_do_not_match") : t("auth.error.password_policy_unmet"));
      return;
    }
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
          password_confirm: passwordConfirm,
          preferred_language: preferredLanguage,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(getGuidedAuthErrorMessage(payload, res.status, t, "register"));
        return;
      }

      const q = new URLSearchParams({ email });
      if (next) q.set("next", next);
      router.replace(`/register/verify?${q.toString()}`);
      router.refresh();
    } catch {
      setError(t("auth.error.register_failed_guidance"));
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
        <PasswordPolicyChecklist password={password} t={t} />
      </div>
      <div>
        <label className="block text-sm">{t("auth.confirm_password")}</label>
        <input className="border rounded w-full p-2" type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} required />
        {passwordConfirm && !passwordsMatch && (
          <div className="mt-1 text-xs text-red-600">{t("auth.passwords_do_not_match")}</div>
        )}
      </div>
      {error && <div className="text-red-600 text-sm whitespace-pre-wrap">{error}</div>}
      <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-50" disabled={!canSubmit}>
        {loading ? t("auth.creating_account") : t("auth.create_account")}
      </button>
    </form>
  );
}
