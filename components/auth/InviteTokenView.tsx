"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ResolveData = {
  grid_name?: string;
  grid?: {
    id?: number | string;
    name?: string;
    grid_code?: string | null;
  } | null;
  grid_code?: string | null;
  role?: string;
  type?: string;
  message?: string;
  status?: string;
  active?: boolean;
  expires_at?: string | null;
  email?: string | null;
  to_email?: string | null;
  to_user_email?: string | null;
  recipient_email?: string | null;
  to_user?: { email?: string | null } | null;
  recipient?: { email?: string | null } | null;
};

type WhoAmI = {
  id?: number | string | null;
  email?: string | null;
};

type InviteListItem = {
  token?: string | null;
  invite_token?: string | null;
  invitation_token?: string | null;
  accept_token?: string | null;
  invite_url?: string | null;
  link_url?: string | null;
  invitation_url?: string | null;
  url?: string | null;
  link?: string | null;
  grid_name?: string | null;
  grid_code?: string | null;
  grid?: {
    id?: number | string;
    name?: string;
    grid_code?: string | null;
  } | number | string | null;
  role?: string | null;
  type?: string | null;
  message?: string | null;
  status?: string | null;
  active?: boolean;
  expires_at?: string | null;
  email?: string | null;
  to_email?: string | null;
  to_user_email?: string | null;
  recipient_email?: string | null;
  to_user?: { email?: string | null } | null;
  recipient?: { email?: string | null } | null;
};

type MembershipListItem = {
  user_id?: number | string | null;
  user_email?: string | null;
  user?:
    | number
    | {
        id?: number | string | null;
        email?: string | null;
      }
    | null;
};

type StatusBadge = {
  label: string;
  className: string;
};

const AUTO_JOIN_STORAGE_KEY = "invite_auto_join_token";

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function statusBadgeFromValue(status: unknown): StatusBadge {
  const raw = String(status ?? "").toLowerCase().trim();
  if (raw === "accepted") {
    return { label: "Accepted", className: "text-green-700 bg-green-50 border border-green-200" };
  }
  if (raw === "declined" || raw === "rejected") {
    return { label: "Declined", className: "text-red-700 bg-red-50 border border-red-200" };
  }
  if (raw === "expired") {
    return { label: "Expired", className: "text-yellow-700 bg-yellow-50 border border-yellow-200" };
  }
  if (raw === "cancelled" || raw === "canceled") {
    return { label: "Cancelled", className: "text-orange-700 bg-orange-50 border border-orange-200" };
  }
  return { label: "Pending...", className: "text-gray-700 bg-gray-100 border border-gray-200" };
}

function tokenFromAnyInvite(inv: InviteListItem): string {
  const direct = inv.token ?? inv.invite_token ?? inv.invitation_token ?? inv.accept_token;
  if (direct) return String(direct);

  const rawUrl = inv.link_url ?? inv.invite_url ?? inv.invitation_url ?? inv.url ?? inv.link;
  if (!rawUrl || typeof rawUrl !== "string") return "";
  try {
    const u = new URL(rawUrl, "http://localhost");
    const t = u.searchParams.get("token");
    if (t) return t;
    const m = u.pathname.match(/\/invite\/([^/?#]+)/);
    return m?.[1] ?? "";
  } catch {
    return "";
  }
}

function listFromResponse(data: unknown): InviteListItem[] {
  if (Array.isArray(data)) return data as InviteListItem[];
  if (data && typeof data === "object" && Array.isArray((data as { results?: unknown[] }).results)) {
    return (data as { results: unknown[] }).results as InviteListItem[];
  }
  return [];
}

function mapInviteToResolveData(inv: InviteListItem): ResolveData {
  const gridObj = typeof inv.grid === "object" && inv.grid ? inv.grid : null;
  return {
    grid_name: inv.grid_name ?? gridObj?.name ?? undefined,
    grid: gridObj
      ? {
          id: gridObj.id,
          name: gridObj.name,
          grid_code: gridObj.grid_code ?? null,
        }
      : null,
    grid_code: inv.grid_code ?? gridObj?.grid_code ?? null,
    role: inv.role ?? undefined,
    type: inv.type ?? undefined,
    message: inv.message ?? undefined,
    status: inv.status ?? (inv.active === false ? "inactive" : "pending"),
    active: inv.active,
    expires_at: inv.expires_at ?? null,
    email: inv.email ?? null,
    to_email: inv.to_email ?? null,
    to_user_email: inv.to_user_email ?? null,
    recipient_email: inv.recipient_email ?? null,
    to_user: inv.to_user ?? null,
    recipient: inv.recipient ?? null,
  };
}

function gridTargetFromResolved(data: ResolveData | null): { code: string | null; id: number | string | null } {
  if (!data) return { code: null, id: null };
  return {
    code: data.grid_code ?? data.grid?.grid_code ?? null,
    id: data.grid?.id ?? null,
  };
}

function invitedEmailFromResolved(resolved: ResolveData | null): string {
  if (!resolved) return "";
  return normalizeEmail(
    resolved.email ??
      resolved.to_email ??
      resolved.to_user_email ??
      resolved.recipient_email ??
      resolved.to_user?.email ??
      resolved.recipient?.email ??
      ""
  );
}

export default function InviteTokenView({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolveData | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [meId, setMeId] = useState<string>("");
  const [meEmail, setMeEmail] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const navigateToGrid = useCallback(
    async (codeLike: string | number | null | undefined, idLike: string | number | null | undefined) => {
      let code = codeLike != null ? String(codeLike).trim() : "";
      const rawId = idLike != null ? String(idLike).trim() : "";
      // Some backends can return grid code inside membership.grid; accept it directly.
      if (!code && rawId && !/^\d+$/.test(rawId)) {
        code = rawId;
      }
      if (!code && idLike != null) {
        try {
          // First try as numeric/id route.
          if (rawId) {
            let r = await fetch(`/api/grids/${encodeURIComponent(rawId)}`, { cache: "no-store" });
            if (!r.ok) {
              // Fallback: maybe the raw value is actually a grid code.
              r = await fetch(`/api/grids/code/${encodeURIComponent(rawId)}`, { cache: "no-store" });
            }
            if (r.ok) {
              const g = await r.json().catch(() => ({}));
              if (g?.grid_code) code = String(g.grid_code).trim();
              else if (g?.id != null && g?.grid_code == null && rawId && !/^\d+$/.test(rawId)) code = rawId;
            }
          }
        } catch {}
      }
      if (!code) return false;
      router.replace(`/grid/${encodeURIComponent(code)}`);
      router.refresh();
      return true;
    },
    [router]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/whoami", { cache: "no-store" });
        if (!cancelled) {
          setIsAuthenticated(r.ok);
          if (r.ok) {
            const me = (await r.json().catch(() => ({}))) as WhoAmI;
            setMeId(me?.id != null ? String(me.id) : "");
            setMeEmail(normalizeEmail(me.email));
          }
        }
      } catch {
        if (!cancelled) setIsAuthenticated(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/invitations/resolve/?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const status = String(j?.status ?? "").toLowerCase();
        const gridCode = j?.grid_code ?? j?.grid?.grid_code ?? null;
        const gridId = j?.grid?.id ?? null;

        if (status === "accepted") {
          const moved = await navigateToGrid(gridCode, gridId);
          if (!moved && !cancelled) {
            setResolved(j as ResolveData);
          }
          return;
        }

        const hasRenderableInfo = Boolean(
          j?.status || j?.grid_name || j?.grid?.name || j?.role || j?.type || j?.message || j?.expires_at
        );
        if (!r.ok) {
          if (hasRenderableInfo && !cancelled) {
            const resolvedFromResolve = j as ResolveData;
            setResolved(resolvedFromResolve);
            const target = gridTargetFromResolved(resolvedFromResolve);
            if (String(resolvedFromResolve.status ?? "").toLowerCase() === "accepted" && (target.code || target.id)) {
              await navigateToGrid(target.code, target.id);
            }
            return;
          }

          // Fallback: read invitation list and recover full status/details by token.
          const listRes = await fetch("/api/invitations/?ordering=-created_at", { cache: "no-store" });
          if (listRes.ok) {
            const listData = await listRes.json().catch(() => ({}));
            const list = listFromResponse(listData);
            const found = list.find((inv) => tokenFromAnyInvite(inv) === token) ?? null;
            if (found && !cancelled) {
              const recovered = mapInviteToResolveData(found);
              setResolved(recovered);
              const target = gridTargetFromResolved(recovered);
              if (String(recovered.status ?? "").toLowerCase() === "accepted" && (target.code || target.id)) {
                await navigateToGrid(target.code, target.id);
              }
              return;
            }
          }

          // Never surface "Invitation is inactive" generic message.
          const rawErr = String(j?.error || j?.detail || "").toLowerCase();
          if (rawErr.includes("inactive")) {
            if (!cancelled) setError("Invitation could not be loaded.");
            return;
          }
          setError(j?.error || j?.detail || "Invitation is invalid or expired.");
          return;
        }
        if (!cancelled) setResolved(j as ResolveData);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not resolve invitation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router, navigateToGrid]);

  const invitedEmail = invitedEmailFromResolved(resolved);
  const resolvedStatus = String(resolved?.status ?? "").toLowerCase();
  const statusTag = statusBadgeFromValue(resolved?.status);
  const isPendingStatus = resolvedStatus === "pending";
  const isAlreadyAccepted = resolvedStatus === "accepted";
  const isLinkInvite = String(resolved?.type ?? "").toLowerCase() === "link";
  const mustUseInvitedAccount = Boolean(
    isAuthenticated &&
    invitedEmail &&
    meEmail &&
    invitedEmail !== meEmail
  );

  const accept = useCallback(async () => {
    if (isLinkInvite && isAuthenticated === false) {
      try {
        window.sessionStorage.setItem(AUTO_JOIN_STORAGE_KEY, token);
      } catch {}
      router.push(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
      return;
    }
    if (mustUseInvitedAccount) {
      setError(`This invite is for ${invitedEmail}. Please sign in with that account.`);
      return;
    }
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
      router.refresh();
      const gridCode =
        j?.grid_code ??
        j?.membership?.grid_code ??
        resolved?.grid_code ??
        resolved?.grid?.grid_code ??
        null;
      const gridId = j?.membership?.grid || j?.membership?.grid_id || resolved?.grid?.id || null;
      let moved = await navigateToGrid(gridCode, gridId);

      if (!moved) {
        try {
          const rr = await fetch(`/api/invitations/resolve/?token=${encodeURIComponent(token)}`, { cache: "no-store" });
          const rj = await rr.json().catch(() => ({}));
          const rCode = rj?.grid_code ?? rj?.grid?.grid_code ?? null;
          const rId = rj?.grid?.id ?? null;
          moved = await navigateToGrid(rCode, rId);
        } catch {}
      }

      if (!moved) {
        router.replace("/dashboard");
        router.refresh();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not accept invitation.");
    } finally {
      setAccepting(false);
    }
  }, [invitedEmail, isAuthenticated, isLinkInvite, mustUseInvitedAccount, resolved, router, token, navigateToGrid]);

  // Safety net: once accepted, keep trying a short-lived resolve->redirect flow
  // in case backend response arrives without grid_code on first attempt.
  useEffect(() => {
    if (!accepted) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tryRedirect = async (attempt: number) => {
      if (cancelled) return;
      let moved = await navigateToGrid(
        resolved?.grid_code ?? resolved?.grid?.grid_code ?? null,
        resolved?.grid?.id ?? null
      );
      if (moved || cancelled) return;

      try {
        const rr = await fetch(`/api/invitations/resolve/?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const rj = await rr.json().catch(() => ({}));
        moved = await navigateToGrid(rj?.grid_code ?? rj?.grid?.grid_code ?? null, rj?.grid?.id ?? null);
      } catch {}
      if (moved || cancelled) return;

      if (attempt >= 5) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      timer = setTimeout(() => void tryRedirect(attempt + 1), 300);
    };

    void tryRedirect(1);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [accepted, navigateToGrid, resolved?.grid?.id, resolved?.grid?.grid_code, resolved?.grid_code, router, token]);

  useEffect(() => {
    if (!isLinkInvite) return;
    if (!isPendingStatus) return;
    if (isAuthenticated !== true) return;
    if (mustUseInvitedAccount) return;
    if (accepting || accepted) return;

    let autoJoinToken = "";
    try {
      autoJoinToken = window.sessionStorage.getItem(AUTO_JOIN_STORAGE_KEY) || "";
    } catch {
      autoJoinToken = "";
    }
    if (autoJoinToken !== token) return;

    try {
      window.sessionStorage.removeItem(AUTO_JOIN_STORAGE_KEY);
    } catch {}
    void accept();
  }, [
    accept,
    accepted,
    accepting,
    isAuthenticated,
    isLinkInvite,
    isPendingStatus,
    mustUseInvitedAccount,
    token,
  ]);

  // Link invites remain pending (reusable), so detect "already joined" via membership.
  useEffect(() => {
    if (!isLinkInvite) return;
    if (isAuthenticated !== true) return;
    if (!resolved) return;
    if (accepting) return;
    const blocked = ["declined", "rejected", "expired", "cancelled", "canceled"];
    if (blocked.includes(resolvedStatus)) return;

    let cancelled = false;
    (async () => {
      let gridId: string | null = resolved?.grid?.id != null ? String(resolved.grid.id) : null;
      const gridCode = resolved?.grid_code ?? resolved?.grid?.grid_code ?? null;

      if (!gridId && gridCode) {
        try {
          const gr = await fetch(`/api/grids/code/${encodeURIComponent(String(gridCode))}`, { cache: "no-store" });
          if (gr.ok) {
            const gj = await gr.json().catch(() => ({}));
            if (gj?.id != null) gridId = String(gj.id);
          }
        } catch {}
      }
      if (!gridId) return;

      try {
        const mr = await fetch(`/api/grid_memberships/?grid=${encodeURIComponent(gridId)}`, { cache: "no-store" });
        if (!mr.ok || cancelled) return;
        const mj = await mr.json().catch(() => ({}));
        const list: MembershipListItem[] = Array.isArray(mj)
          ? (mj as MembershipListItem[])
          : Array.isArray(mj?.results)
            ? (mj.results as MembershipListItem[])
            : [];
        const myEmail = meEmail;
        const mine = list.find((m) => {
          const uid = m?.user_id ?? (typeof m?.user === "number" ? m.user : m?.user?.id);
          const email = normalizeEmail(m?.user_email ?? m?.user?.email ?? "");
          if (meId && uid != null && String(uid) === meId) return true;
          if (myEmail && email && email === myEmail) return true;
          return false;
        });
        if (!mine || cancelled) return;
        await navigateToGrid(gridCode, gridId);
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [
    accepting,
    isAuthenticated,
    isLinkInvite,
    meEmail,
    meId,
    navigateToGrid,
    resolved,
    resolvedStatus,
  ]);

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
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Status:</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTag.className}`}>
              {statusTag.label}
            </span>
          </div>
          {resolved.expires_at && <div><span className="text-gray-500">Expires:</span> {new Date(resolved.expires_at).toLocaleString()}</div>}
          {isPendingStatus && (
            <button
              type="button"
              onClick={accept}
              disabled={accepting || accepted || mustUseInvitedAccount || isAlreadyAccepted}
              className="mt-2 px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-60"
            >
              {accepting ? "Joining..." : accepted || isAlreadyAccepted ? "Accepted" : isLinkInvite ? "Join Grid" : "Accept invitation"}
            </button>
          )}
          {mustUseInvitedAccount && (
            <div className="text-xs text-red-600">
              This invite is for <span className="font-medium">{invitedEmail}</span>. Sign in with that account to accept.
            </div>
          )}
        </div>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}
      {isAuthenticated === false && !isLinkInvite && (
        <p className="text-sm text-gray-600">
          <Link href="/login" className="underline">Log in</Link> or <Link href="/register" className="underline">create an account</Link>.
        </p>
      )}
    </div>
  );
}
