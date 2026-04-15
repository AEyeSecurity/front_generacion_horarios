"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/use-i18n";

type UserLookup = { email?: string };

type UserLookupResponse = UserLookup[] | { results?: UserLookup[] };

export default function PasswordResetPage() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const initialEmail = useMemo(() => sp.get("email") || "", [sp]);
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const lookup = await fetch(`/api/users?search=${encodeURIComponent(normalizedEmail)}`, {
        cache: "no-store",
      });
      if (!lookup.ok) {
        setError(t("auth.email_no_account"));
        return;
      }

      const raw = (await lookup.json().catch(() => ({}))) as UserLookupResponse;
      const list = Array.isArray(raw) ? raw : raw?.results ?? [];
      const exists = list.some((user) => {
        const userEmail = String(user?.email || "").trim().toLowerCase();
        return userEmail && userEmail === normalizedEmail;
      });

      if (!exists) {
        setError(t("auth.email_no_account"));
        return;
      }

      const r = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      if (!r.ok) {
        let msg = t("auth.request_process_failed");
        try {
          const j = await r.json();
          msg = j?.error || j?.detail || msg;
        } catch {
          // ignore parse failures
        }
        setError(msg);
        return;
      }
      setMessage(t("auth.reset_email_sent"));
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : t("auth.request_process_failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 bg-white p-6 rounded-lg shadow space-y-4">
      <h1 className="text-xl font-semibold">{t("auth.reset_password")}</h1>
      <p className="text-sm text-gray-700">{t("auth.reset_password_instructions")}</p>
      <form onSubmit={onSubmit} className="space-y-3">
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
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-60"
        >
          {loading ? t("auth.sending") : t("auth.send_reset_link")}
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
