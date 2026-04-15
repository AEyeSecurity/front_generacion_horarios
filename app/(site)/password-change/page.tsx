"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { canChangePassword } from "@/lib/account";
import type { User } from "@/lib/types";
import { useI18n } from "@/lib/use-i18n";

export default function PasswordChangePage() {
  const { t } = useI18n();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch("/api/whoami", { cache: "no-store" });
        if (!r.ok) {
          if (active) setAllowed(false);
          return;
        }
        const me = (await r.json().catch(() => null)) as User | null;
        if (active) setAllowed(canChangePassword(me));
      } finally {
        if (active) setCheckingAccess(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!allowed) {
      setError(t("password_change.google_accounts_change_in_google"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t("password_change.new_passwords_do_not_match"));
      return;
    }
    if (currentPassword === newPassword) {
      setError(t("password_change.new_password_must_differ"));
      return;
    }

    setLoading(true);
    try {
      const r = await fetch("/api/auth/password-change", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          old_password: currentPassword,
          new_password: newPassword,
        }),
      });
      if (!r.ok) {
        let msg = t("password_change.could_not_change_password");
        try {
          const j = await r.json();
          msg = j?.error || j?.detail || msg;
        } catch {}
        setError(msg);
        return;
      }
      setMessage(t("password_change.password_updated"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("password_change.could_not_change_password"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 bg-white p-6 rounded-lg shadow space-y-4">
      <h1 className="text-xl font-semibold">{t("password_change.title")}</h1>
      {checkingAccess ? (
        <div className="text-sm text-gray-600">{t("password_change.loading")}</div>
      ) : !allowed ? (
        <div className="space-y-2">
          <div className="text-sm text-gray-700">{t("password_change.google_account_notice")}</div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="block text-sm">{t("password_change.current_password")}</label>
            <input
              className="border rounded w-full p-2"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm">{t("password_change.new_password")}</label>
            <input
              className="border rounded w-full p-2"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm">{t("password_change.confirm_new_password")}</label>
            <input
              className="border rounded w-full p-2"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-60"
          >
            {loading ? t("password_change.updating") : t("password_change.update_password")}
          </button>
        </form>
      )}
      {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">{message}</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      <p className="text-sm text-gray-600">
        {t("password_change.back_to")}{" "}
        <Link href="/dashboard" className="underline">
          {t("password_change.dashboard")}
        </Link>
      </p>
    </div>
  );
}
