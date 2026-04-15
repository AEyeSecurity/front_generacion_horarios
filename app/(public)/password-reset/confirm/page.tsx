"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/use-i18n";

export default function PasswordResetConfirmPage() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const uid = useMemo(() => sp.get("uid") || "", [sp]);
  const token = useMemo(() => sp.get("token") || "", [sp]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!uid || !token) {
      setError(t("auth.invalid_reset_link"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.passwords_do_not_match"));
      return;
    }

    setLoading(true);
    try {
      const r = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uid, token, new_password: password }),
      });
      if (!r.ok) {
        let msg = t("auth.could_not_reset_password");
        try {
          const j = await r.json();
          msg = j?.error || j?.detail || msg;
        } catch {
          // ignore parse failures
        }
        setError(msg);
        return;
      }
      setMessage(t("auth.password_updated_login_now"));
      setPassword("");
      setConfirm("");
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : t("auth.could_not_reset_password"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 bg-white p-6 rounded-lg shadow space-y-4">
      <h1 className="text-xl font-semibold">{t("auth.choose_new_password")}</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm">{t("auth.new_password")}</label>
          <input
            className="border rounded w-full p-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm">{t("auth.confirm_password")}</label>
          <input
            className="border rounded w-full p-2"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-60"
        >
          {loading ? t("auth.updating") : t("auth.update_password")}
        </button>
      </form>
      {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">{message}</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      <p className="text-sm text-gray-600">
        {t("auth.back_to")} <Link href="/login" className="underline">{t("auth.log_in")}</Link>
      </p>
    </div>
  );
}
