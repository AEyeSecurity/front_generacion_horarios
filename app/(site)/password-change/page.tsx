"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { canChangePassword } from "@/lib/account";
import type { User } from "@/lib/types";

export default function PasswordChangePage() {
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
      setError("Google accounts must change password in Google.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("New password must be different from the previous one.");
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
        let msg = "Could not change password";
        try {
          const j = await r.json();
          msg = j?.error || j?.detail || msg;
        } catch {}
        setError(msg);
        return;
      }
      setMessage("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 bg-white p-6 rounded-lg shadow space-y-4">
      <h1 className="text-xl font-semibold">Change password</h1>
      {checkingAccess ? (
        <div className="text-sm text-gray-600">Loading...</div>
      ) : !allowed ? (
        <div className="space-y-2">
          <div className="text-sm text-gray-700">
            This account signs in with Google. Password changes must be done in Google.
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="block text-sm">Current password</label>
            <input
              className="border rounded w-full p-2"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm">New password</label>
            <input
              className="border rounded w-full p-2"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm">Confirm new password</label>
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
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
      )}
      {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">{message}</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      <p className="text-sm text-gray-600">
        Back to <Link href="/dashboard" className="underline">Dashboard</Link>
      </p>
    </div>
  );
}
