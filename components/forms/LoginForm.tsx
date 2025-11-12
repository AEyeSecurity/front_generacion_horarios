"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setP] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sp = useSearchParams();
  const router = useRouter();
  const next = sp.get("next") || "/dashboard";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Login failed" }));
      setError(error || "Login failed");
      return;
    }
    // Navigate and force a re-render so server components (NavBar)
    // pick up the new auth cookies without a manual refresh
    router.replace(next);
    router.refresh();
  }

  const registered = sp.get("registered");
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {registered && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
          Account created. You can sign in now.
        </div>
      )}
      <div>
        <label className="block text-sm">Email</label>
        <input className="border rounded w-full p-2" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
      </div>
      <div>
        <label className="block text-sm">Password</label>
        <input className="border rounded w-full p-2" type="password" value={password} onChange={e=>setP(e.target.value)} />
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <button className="px-4 py-2 rounded bg-black text-white">Login</button>
    </form>
  );
}
