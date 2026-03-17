"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function PasswordResetPage() {
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
        setError("That address doesn't have an account.");
        return;
      }

      const raw = await lookup.json().catch(() => ({}));
      const list = Array.isArray(raw) ? raw : raw?.results ?? [];
      const exists = list.some((u: any) => {
        const userEmail = String(u?.email || "").trim().toLowerCase();
        return userEmail && userEmail === normalizedEmail;
      });

      if (!exists) {
        setError("That address doesn't have an account.");
        return;
      }

      const r = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      if (!r.ok) {
        let msg = "Could not process request";
        try {
          const j = await r.json();
          msg = j?.error || j?.detail || msg;
        } catch {}
        setError(msg);
        return;
      }
      setMessage("Reset email sent.");
    } catch (err: any) {
      setError(err?.message || "Could not process request");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 bg-white p-6 rounded-lg shadow space-y-4">
      <h1 className="text-xl font-semibold">Reset password</h1>
      <p className="text-sm text-gray-700">Enter your account email and we&apos;ll send a reset link.</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm">Email</label>
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
          {loading ? "Sending..." : "Send reset link"}
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
