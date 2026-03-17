"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ResolveData = {
  grid_name?: string;
  grid?: any;
  grid_code?: string | null;
  role?: string;
  type?: string;
  message?: string;
  status?: string;
  active?: boolean;
  expires_at?: string | null;
};

export default function InviteTokenView({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolveData | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/invitations/resolve/?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setError(j?.error || j?.detail || "Invitation is invalid or expired.");
          return;
        }
        if (!cancelled) setResolved(j);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not resolve invitation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept() {
    setAccepting(true);
    setError(null);
    try {
      const r = await fetch(`/api/invitations/accept/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 401) {
          router.push(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
          return;
        }
        throw new Error(j?.error || j?.detail || "Could not accept invitation.");
      }
      setAccepted(true);
      const gridCode =
        j?.grid_code ??
        j?.membership?.grid_code ??
        resolved?.grid_code ??
        resolved?.grid?.grid_code ??
        null;
      const gridId = j?.membership?.grid || j?.membership?.grid_id || resolved?.grid?.id || null;
      if (gridCode) {
        router.replace(`/grid/${encodeURIComponent(String(gridCode))}`);
        router.refresh();
      } else if (gridId) {
        router.replace(`/grid/${encodeURIComponent(String(gridId))}`);
        router.refresh();
      }
    } catch (e: any) {
      setError(e?.message || "Could not accept invitation.");
    } finally {
      setAccepting(false);
    }
  }

  if (!token) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-white p-6 rounded-lg shadow">
        <h1 className="text-xl font-semibold mb-2">Invitation</h1>
        <p className="text-sm text-red-600">Missing invitation token.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-16 bg-white p-6 rounded-lg shadow space-y-4">
      <h1 className="text-xl font-semibold">Invitation</h1>
      {loading && <p className="text-sm text-gray-700">Loading invitation...</p>}

      {!loading && resolved && (
        <div className="space-y-2 text-sm">
          <div><span className="text-gray-500">Grid:</span> {resolved.grid_name || resolved.grid?.name || "-"}</div>
          <div><span className="text-gray-500">Role:</span> {resolved.role || "-"}</div>
          <div><span className="text-gray-500">Type:</span> {resolved.type || "-"}</div>
          {resolved.message && <div><span className="text-gray-500">Message:</span> {resolved.message}</div>}
          <div><span className="text-gray-500">Status:</span> {resolved.status || (resolved.active ? "pending" : "inactive")}</div>
          {resolved.expires_at && <div><span className="text-gray-500">Expires:</span> {new Date(resolved.expires_at).toLocaleString()}</div>}
          <button
            type="button"
            onClick={accept}
            disabled={accepting || accepted}
            className="mt-2 px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-60"
          >
            {accepting ? "Accepting..." : accepted ? "Accepted" : "Accept invitation"}
          </button>
        </div>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}
      <p className="text-sm text-gray-600">
        <Link href="/login" className="underline">Log in</Link> or <Link href="/register" className="underline">create an account</Link>.
      </p>
    </div>
  );
}
