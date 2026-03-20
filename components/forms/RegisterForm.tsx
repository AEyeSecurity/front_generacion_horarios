"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function RegisterForm() {
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
    } catch {}
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, email, password }),
      });
      if (!res.ok) {
        let msg = "Registration failed";
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm">First name</label>
          <input className="border rounded w-full p-2" value={firstName} onChange={(e) => setFirst(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm">Last name</label>
          <input className="border rounded w-full p-2" value={lastName} onChange={(e) => setLast(e.target.value)} required />
        </div>
      </div>
      <div>
        <label className="block text-sm">Email</label>
        <input className="border rounded w-full p-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label className="block text-sm">Password</label>
        <input className="border rounded w-full p-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <div className="text-red-600 text-sm whitespace-pre-wrap">{error}</div>}
      <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-50" disabled={loading}>
        {loading ? "Creating..." : "Create account"}
      </button>
    </form>
  );
}
