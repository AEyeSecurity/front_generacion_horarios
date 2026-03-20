"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import type { User } from "@/lib/types";
import {
  getAvatarDisplayName,
  getAvatarInitials,
  getAvatarPalette,
  getAvatarSeed,
  getAvatarSource,
} from "@/lib/avatar";

type InviteStatus = "pending" | "accepted" | "declined" | "expired";

type InviteUser = {
  id?: number | string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  [key: string]: unknown;
};

type InviteGrid = {
  id?: number | string | null;
  name?: string | null;
  grid_code?: string | null;
  [key: string]: unknown;
};

type Invite = {
  id?: number | string | null;
  token?: string | null;
  invite_token?: string | null;
  invitation_token?: string | null;
  accept_token?: string | null;
  invite_url?: string | null;
  link_url?: string | null;
  invitation_url?: string | null;
  url?: string | null;
  link?: string | null;
  status?: string | null;
  active?: boolean | null;
  expires_at?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  sent_at?: string | null;
  date?: string | null;
  role?: string | null;
  message?: string | null;
  type?: string | null;
  direction?: string | null;
  grid?: InviteGrid | number | string | null;
  grid_id?: number | string | null;
  grid_name?: string | null;
  grid_code?: string | null;
  gridCode?: string | null;
  email?: string | null;
  to_email?: string | null;
  to_user_email?: string | null;
  recipient_email?: string | null;
  user_id?: number | string | null;
  to_user_id?: number | string | null;
  recipient_id?: number | string | null;
  to_user?: InviteUser | null;
  recipient?: InviteUser | null;
  created_by?: InviteUser | null;
  created_by_id?: number | string | null;
  created_by_first_name?: string | null;
  created_by_last_name?: string | null;
  created_by_email?: string | null;
  [key: string]: unknown;
};

type ApiList = { results?: unknown };
type ApiObject = Record<string, unknown>;

const MONTH_MS = 31 * 24 * 60 * 60 * 1000;

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function listFromResponse(data: unknown): Invite[] {
  if (Array.isArray(data)) return data as Invite[];
  if (data && typeof data === "object" && Array.isArray((data as ApiList).results)) {
    return (data as ApiList).results as Invite[];
  }
  return [];
}

function tokenFromInvite(inv: Invite): string | null {
  const direct = inv.token ?? inv.invite_token ?? inv.invitation_token ?? inv.accept_token;
  if (direct) return String(direct);

  const rawUrl = inv.link_url ?? inv.invite_url ?? inv.invitation_url ?? inv.url ?? inv.link;
  if (!rawUrl || typeof rawUrl !== "string") return null;

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const u = new URL(rawUrl, base);
    const token = u.searchParams.get("token");
    if (token) return token;
    const m = u.pathname.match(/\/invite\/([^/?#]+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function inviteLink(inv: Invite): string {
  const explicit = inv.link_url ?? inv.invite_url ?? inv.invitation_url ?? inv.url ?? inv.link;
  if (explicit && typeof explicit === "string") return explicit;
  const token = tokenFromInvite(inv);
  if (!token) return "";
  return `/invite/${encodeURIComponent(token)}`;
}

function inviteKey(inv: Invite): string {
  if (inv.id !== undefined && inv.id !== null) return `id:${String(inv.id)}`;
  const token = tokenFromInvite(inv);
  if (token) return `token:${token}`;
  return `fallback:${String(inv.email ?? "")}:${String(inv.created_at ?? "")}:${String(inv.role ?? "")}`;
}

function gridIdFromInvite(inv: Invite): string | null {
  const raw =
    (typeof inv.grid === "object" && inv.grid ? inv.grid.id : null) ??
    inv.grid_id ??
    (typeof inv.grid === "number" || typeof inv.grid === "string" ? inv.grid : null);
  if (raw === null || raw === undefined) return null;
  const asString = String(raw).trim();
  if (!/^\d+$/.test(asString)) return null;
  return asString;
}

function gridCodeFromInvite(inv: Invite): string | null {
  const explicit =
    inv.grid_code ??
    (typeof inv.grid === "object" && inv.grid ? inv.grid.grid_code : null) ??
    inv.gridCode;
  if (explicit) return String(explicit);

  if (typeof inv.grid === "string") {
    const raw = inv.grid.trim();
    if (raw && !/^\d+$/.test(raw)) return raw;
  }
  return null;
}

function isLegacyInvite(inv: Invite): boolean {
  const type = String(inv.type ?? "").toLowerCase();
  if (type === "email" || type === "link") return false;
  if (type === "local") return true;
  return !tokenFromInvite(inv);
}

function createdAtFromInvite(inv: Invite): Date | null {
  const raw = inv.created_at ?? inv.createdAt ?? inv.sent_at ?? inv.date;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function relativeTimeFromInvite(inv: Invite): string {
  const d = createdAtFromInvite(inv);
  if (!d) return "";

  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "less than a minute ago";

  const minutes = Math.floor(diff / 60_000);
  if (minutes === 1) return "a minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "an hour ago";
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days >= 30) return "a month ago";
  if (days >= 14) return `${Math.floor(days / 7)} weeks ago`;
  if (days >= 7) return "a week ago";
  if (days === 1) return "a day ago";
  return `${days} days ago`;
}

function isWithinLastMonth(inv: Invite): boolean {
  const d = createdAtFromInvite(inv);
  if (!d) return true;
  return Date.now() - d.getTime() <= MONTH_MS;
}

function isCancelledInvite(inv: Invite): boolean {
  const raw = String(inv.status ?? "").toLowerCase().trim();
  return raw === "cancelled" || raw === "canceled";
}

function statusFromInvite(inv: Invite): InviteStatus {
  const raw = String(inv.status ?? "").toLowerCase();
  if (raw === "accepted") return "accepted";
  if (raw === "declined" || raw === "declined" || raw === "cancelled" || raw === "canceled") return "declined";
  if (raw === "expired") return "expired";

  const active = inv.active !== false;
  if (!active) {
    const exp = inv.expires_at ? new Date(inv.expires_at) : null;
    if (exp && !Number.isNaN(exp.getTime()) && exp.getTime() <= Date.now()) return "expired";
    return "declined";
  }
  return "pending";
}

function statusBadge(status: InviteStatus): { label: string; className: string } | null {
  if (status === "accepted") return { label: "Accepted", className: "text-green-700 bg-green-50 border border-green-200" };
  if (status === "declined") return { label: "Declined", className: "text-red-700 bg-red-50 border border-red-200" };
  if (status === "expired") return { label: "Expired", className: "text-yellow-700 bg-yellow-50 border border-yellow-200" };
  return null;
}

function gridPath(inv: Invite): string | null {
  const code = inv.grid_code ?? (typeof inv.grid === "object" && inv.grid ? inv.grid.grid_code : null) ?? inv.gridCode ?? null;
  if (code) return `/grid/${encodeURIComponent(String(code))}`;

  const id =
    (typeof inv.grid === "object" && inv.grid ? inv.grid.id : null) ??
    inv.grid_id ??
    (typeof inv.grid === "number" || typeof inv.grid === "string" ? inv.grid : null);
  if (id !== null && id !== undefined) return `/grid/${encodeURIComponent(String(id))}`;
  return null;
}

function isForCurrentUser(inv: Invite, me: User): boolean {
  const myId = String(me.id ?? "");
  const myEmail = normalizeEmail(me.email);

  const idCandidates = [
    inv.to_user_id,
    inv.to_user?.id,
    inv.user_id,
    inv.recipient_id,
    inv.recipient?.id,
  ]
    .filter((v) => v !== null && v !== undefined)
    .map(String);
  if (myId && idCandidates.includes(myId)) return true;

  const emailCandidates = [
    inv.email,
    inv.to_email,
    inv.to_user_email,
    inv.recipient_email,
    inv.to_user?.email,
    inv.recipient?.email,
  ]
    .map(normalizeEmail)
    .filter(Boolean);
  if (myEmail && emailCandidates.includes(myEmail)) return true;

  return String(inv.direction ?? "").toLowerCase() === "incoming";
}

function nameFor(user: InviteUser | null | undefined): string {
  if (!user) return "";
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  if (name) return name;
  return user.email || "";
}

function senderFromInvite(inv: Invite): InviteUser {
  if (inv.created_by) return inv.created_by;
  return {
    first_name: inv.created_by_first_name,
    last_name: inv.created_by_last_name,
    email: inv.created_by_email,
  };
}

function parseJsonObject(input: string): ApiObject {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (parsed && typeof parsed === "object") return parsed as ApiObject;
  } catch {
    // ignore
  }
  return {};
}

export default function InvitesMenu({ me }: { me: User }) {
  const router = useRouter();
  const [items, setItems] = useState<Invite[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seenOnce, setSeenOnce] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(`invite-bell-seen-${String(me.id ?? "anon")}`) === "1";
  });
  const seenKey = useMemo(() => `invite-bell-seen-${String(me.id ?? "anon")}`, [me.id]);

  const loadInvites = useCallback(async () => {
    try {
      const [allRes, incomingRes] = await Promise.all([
        fetch("/api/invitations/?ordering=-created_at", { cache: "no-store" }).catch(() => null),
        fetch("/api/invitations/incoming/", { cache: "no-store" }).catch(() => null),
      ]);

      const allData = allRes && allRes.ok ? await allRes.json().catch(() => ({})) : {};
      const incomingData = incomingRes && incomingRes.ok ? await incomingRes.json().catch(() => ({})) : {};
      const all = listFromResponse(allData);
      const incoming = listFromResponse(incomingData);
      const incomingKeys = new Set(incoming.map((inv) => inviteKey(inv)));

      const byKey = new Map<string, Invite>();
      for (const inv of incoming) byKey.set(inviteKey(inv), inv);
      for (const inv of all) {
        const key = inviteKey(inv);
        const prev = byKey.get(key) ?? {};
        byKey.set(key, { ...prev, ...inv });
      }

      const merged = Array.from(byKey.values())
        .filter((inv) => isForCurrentUser(inv, me) || incomingKeys.has(inviteKey(inv)))
        .filter((inv) => !isCancelledInvite(inv))
        .filter((inv) => isWithinLastMonth(inv))
        .sort((a, b) => {
          const ta = createdAtFromInvite(a)?.getTime() ?? 0;
          const tb = createdAtFromInvite(b)?.getTime() ?? 0;
          return tb - ta;
        });

      const idsNeedingName = new Set<string>();
      const codesNeedingName = new Set<string>();
      for (const inv of merged) {
        const hasName = Boolean(inv.grid_name || (typeof inv.grid === "object" && inv.grid?.name));
        const gid = gridIdFromInvite(inv);
        const code = gridCodeFromInvite(inv);
        if (hasName) continue;
        if (gid) idsNeedingName.add(gid);
        else if (code) codesNeedingName.add(code);
      }

      if (idsNeedingName.size > 0 || codesNeedingName.size > 0) {
        const entries = await Promise.all(
          [
            ...Array.from(idsNeedingName).map(async (gid) => {
              try {
                const r = await fetch(`/api/grids/${encodeURIComponent(gid)}`, { cache: "no-store" });
                if (!r.ok) return [`id:${gid}`, null] as const;
                const j = (await r.json().catch(() => ({}))) as { name?: string };
                return [`id:${gid}`, typeof j.name === "string" && j.name.trim() ? j.name : null] as const;
              } catch {
                return [`id:${gid}`, null] as const;
              }
            }),
            ...Array.from(codesNeedingName).map(async (code) => {
              try {
                const r = await fetch(`/api/grids/code/${encodeURIComponent(code)}`, { cache: "no-store" });
                if (!r.ok) return [`code:${code}`, null] as const;
                const j = (await r.json().catch(() => ({}))) as { name?: string };
                return [`code:${code}`, typeof j.name === "string" && j.name.trim() ? j.name : null] as const;
              } catch {
                return [`code:${code}`, null] as const;
              }
            }),
          ]
        );
        const nameById = new Map(entries);

        const unresolvedTokens = new Set<string>();
        for (const inv of merged) {
          const hasName = Boolean(inv.grid_name || (typeof inv.grid === "object" && inv?.grid?.name));
          if (hasName) continue;
          const gid = gridIdFromInvite(inv);
          const code = gridCodeFromInvite(inv);
          const resolved = gid
            ? nameById.get(`id:${gid}`)
            : code
              ? nameById.get(`code:${code}`)
              : null;
          if (resolved) continue;
          const token = tokenFromInvite(inv);
          if (token) unresolvedTokens.add(token);
        }

        const tokenEntries = await Promise.all(
          Array.from(unresolvedTokens).map(async (token) => {
            try {
              const r = await fetch(`/api/invitations/resolve/?token=${encodeURIComponent(token)}`, { cache: "no-store" });
              if (!r.ok) return [token, null] as const;
              const j = (await r.json().catch(() => ({}))) as { grid_name?: string; grid?: { name?: string } };
              const name =
                (typeof j.grid_name === "string" && j.grid_name.trim() ? j.grid_name.trim() : null) ??
                (typeof j.grid?.name === "string" && j.grid.name.trim() ? j.grid.name.trim() : null);
              return [token, name] as const;
            } catch {
              return [token, null] as const;
            }
          })
        );
        const nameByToken = new Map(tokenEntries);

        const withGridNames = merged.map((inv) => {
          if (inv.grid_name || (typeof inv.grid === "object" && inv.grid?.name)) return inv;

          const gid = gridIdFromInvite(inv);
          const code = gridCodeFromInvite(inv);
          const fromIdOrCode = gid
            ? nameById.get(`id:${gid}`)
            : code
              ? nameById.get(`code:${code}`)
              : null;
          const token = tokenFromInvite(inv);
          const fromToken = token ? nameByToken.get(token) : null;
          const resolved = fromIdOrCode || fromToken;
          if (!resolved) return inv;

          if (typeof inv.grid === "object" && inv.grid) {
            return { ...inv, grid_name: resolved, grid: { ...inv.grid, name: resolved } };
          }
          return { ...inv, grid_name: resolved };
        });
        setItems(withGridNames);
        return;
      }

      setItems(merged);
    } catch {
      // silent fail for bell menu
    }
  }, [me]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInvites();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadInvites]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void loadInvites();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, loadInvites]);

  const pendingCount = useMemo(
    () => items.filter((inv) => statusFromInvite(inv) === "pending").length,
    [items]
  );
  const unseen = pendingCount > 0 && !seenOnce;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next || seenOnce) return;
    setSeenOnce(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(seenKey, "1");
    }
  }

  async function acceptInvite(inv: Invite) {
    setError(null);
    const token = tokenFromInvite(inv);
    if (!token) {
      setError("This invitation cannot be accepted from here.");
      return;
    }
    const r = await fetch("/api/invitations/accept/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const raw = await r.text().catch(() => "");
    const data = parseJsonObject(raw);
    if (!r.ok) {
      const detail = typeof data.detail === "string" ? data.detail : "";
      const err = typeof data.error === "string" ? data.error : "";
      setError(err || detail || "Could not accept invitation.");
      return;
    }

    const membership = data.membership as ApiObject | undefined;
    const gridCodeFromResponse =
      (typeof data.grid_code === "string" ? data.grid_code : null) ??
      (membership && typeof membership.grid_code === "string" ? membership.grid_code : null);

    setItems((prev) =>
      prev.map((it) =>
        inviteKey(it) === inviteKey(inv)
          ? {
              ...it,
              status: "accepted",
              active: false,
              grid_code: gridCodeFromResponse ?? it.grid_code,
            }
          : it
      )
    );
    router.refresh();
  }

  async function rejectInvite(inv: Invite) {
    setError(null);
    const token = tokenFromInvite(inv);
    if (!token) {
      setError("This invitation cannot be declined from here.");
      return;
    }

    const r = await fetch("/api/invitations/decline/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const raw = await r.text().catch(() => "");
    const data = parseJsonObject(raw);
    if (!r.ok) {
      const detail = typeof data.detail === "string" ? data.detail : "";
      const err = typeof data.error === "string" ? data.error : "";
      setError(err || detail || "Could not reject invitation.");
      return;
    }

    setItems((prev) =>
      prev.map((it) =>
        inviteKey(it) === inviteKey(inv) ? { ...it, status: "declined", active: false } : it
      )
    );
    router.refresh();
  }

  function openInvite(inv: Invite) {
    const status = statusFromInvite(inv);
    if (status === "accepted") {
      const p = gridPath(inv);
      if (p) {
        router.push(p);
        return;
      }
    }
    const link = inviteLink(inv);
    if (link) router.push(link);
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative w-8 h-8 rounded-full inline-flex items-center justify-center hover:bg-gray-100"
          aria-label="Invitations"
        >
          <MessageSquare className="w-5 h-5 text-gray-700" />
          {unseen && (
            <span className="absolute -top-0.5 -right-0.5 block w-2.5 h-2.5 bg-red-500 rounded-full" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[25rem] p-2">
        {items.length === 0 ? (
          <div className="text-sm text-gray-600 p-3">No invitations</div>
        ) : (
          <div className="max-h-[16rem] overflow-y-auto pr-1">
            {items.map((inv) => {
              const status = statusFromInvite(inv);
              const statusTag = statusBadge(status);
              const legacy = isLegacyInvite(inv);
              const sender = senderFromInvite(inv);
              const senderName = nameFor(sender);
              const avatar = getAvatarSource(sender);
              const fallbackName = getAvatarDisplayName(sender);
              const initials = getAvatarInitials(fallbackName);
              const palette = getAvatarPalette(getAvatarSeed(sender));
              const gridName =
                inv.grid_name ??
                (typeof inv.grid === "object" && inv.grid ? inv.grid.name : null) ??
                "Unknown grid";
              const sentAgo = relativeTimeFromInvite(inv);

              return (
                <div
                  role="button"
                  tabIndex={0}
                  key={inviteKey(inv)}
                  className={`w-full text-left flex items-start gap-3 p-2 rounded cursor-pointer ${
                    legacy ? "bg-gray-100 border border-gray-200 hover:bg-gray-200" : "hover:bg-gray-50"
                  }`}
                  onClick={() => openInvite(inv)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openInvite(inv);
                    }
                  }}
                >
                  {!avatar ? (
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold leading-none"
                      style={{ backgroundColor: palette.background, color: palette.text }}
                      title={fallbackName}
                    >
                      <span className="translate-y-px">{initials}</span>
                    </div>
                  ) : (
                    <img
                      src={avatar}
                      alt=""
                      width={28}
                      height={28}
                      className="h-7 w-7 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{senderName}</div>
                    <div className="text-xs text-gray-600 truncate">
                      {gridName}
                      {sentAgo ? ` - ${sentAgo}` : ""}
                    </div>
                    {inv.message && (
                      <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{inv.message}</div>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      {statusTag && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTag.className}`}
                        >
                          {statusTag.label}
                        </span>
                      )}
                      {status === "pending" && (
                        <>
                          <button
                            type="button"
                            className="px-2.5 py-1.5 rounded bg-black text-white text-xs"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void acceptInvite(inv);
                            }}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="px-2.5 py-1.5 rounded border text-xs"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void rejectInvite(inv);
                            }}
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {error && <div className="text-xs text-red-600 p-2">{error}</div>}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
