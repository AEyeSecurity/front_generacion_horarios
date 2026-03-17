"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function PasswordResetConfirmPage() {
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
      setError("Invalid reset link.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
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
        let msg = "Could not reset password";
        try {
          const j = await r.json();
          msg = j?.error || j?.detail || msg;
        } catch {}
        setError(msg);
        return;
      }
      setMessage("Password updated. You can log in now.");
      setPassword("");
      setConfirm("");
    } catch (err: any) {
      setError(err?.message || "Could not reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 bg-white p-6 rounded-lg shadow space-y-4">
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm">New password</label>
          <input
            className="border rounded w-full p-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm">Confirm password</label>
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
          {loading ? "Updating..." : "Update password"}
        </button>
      </form>
      {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">{message}</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      <p className="text-sm text-gray-600">
        Back to <Link href="/login" className="underline">Log in</Link>
      </p>
    </div>
  );
}
