"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import {
  getAvatarDisplayName,
  getAvatarInitials,
  getAvatarPalette,
  getAvatarSeed,
  getAvatarSource,
} from "@/lib/avatar";

type Invite = any;

function tokenFromInvite(inv: any): string | null {
  const direct = inv?.token ?? inv?.invite_token ?? inv?.invitation_token ?? inv?.accept_token;
  if (direct) return String(direct);

  const rawUrl = inv?.invite_url ?? inv?.invitation_url ?? inv?.url ?? inv?.link;
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

function inviteLink(inv: any): string {
  const explicit = inv?.invite_url ?? inv?.invitation_url ?? inv?.url ?? inv?.link;
  if (explicit && typeof explicit === "string") return explicit;
  const token = tokenFromInvite(inv);
  if (!token) return "";
  return `/invite/${encodeURIComponent(token)}`;
}

export default function InvitesMenu() {
  const [items, setItems] = useState<Invite[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unseen = useMemo(() => items.length > 0 && !open, [items, open]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch(`/api/invitations/incoming/`, { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json().catch(() => []);
        const list = Array.isArray(data) ? data : data.results ?? [];
        if (active) setItems(list);
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, []);

  async function accept(inv: Invite) {
    setError(null);
    const token = tokenFromInvite(inv);
    if (!token) {
      setError("This invitation does not expose a token.");
      return;
    }
    const r = await fetch(`/api/invitations/accept/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (r.ok) {
      setItems((prev) => prev.filter((it: any) => String(it.id) !== String(inv.id)));
      return;
    }
    const j = await r.json().catch(() => ({}));
    setError(j?.error || j?.detail || "Could not accept invitation.");
  }

  const nameFor = (u: any) => [u?.first_name, u?.last_name].filter(Boolean).join(" ") || u?.email || "";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="relative w-8 h-8 rounded-full inline-flex items-center justify-center hover:bg-gray-100" aria-label="Invitations">
          <MessageSquare className="w-5 h-5 text-gray-700" />
          {unseen && <span className="absolute -top-0.5 -right-0.5 block w-2.5 h-2.5 bg-red-500 rounded-full" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[22rem] p-2">
        {items.length === 0 ? (
          <div className="text-sm text-gray-600 p-3">No invitations</div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            {items.map((inv: any) => {
              const role = inv.role || "";
              const gridName = inv.grid_name || inv.grid?.name || `#${inv.grid}`;
              const sender = inv.created_by || {
                first_name: inv.created_by_first_name,
                last_name: inv.created_by_last_name,
                email: inv.created_by_email,
              };
              const senderName = nameFor(sender);
              const avatar = getAvatarSource(sender);
              const fallbackName = getAvatarDisplayName(sender);
              const initials = getAvatarInitials(fallbackName);
              const palette = getAvatarPalette(getAvatarSeed(sender));
              const link = inviteLink(inv);

              return (
                <div key={inv.id} className="flex items-start gap-3 p-2 rounded hover:bg-gray-50">
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
                  <div className="flex-1">
                    <div className="text-sm font-medium">{senderName}</div>
                    <div className="text-xs text-gray-600">{gridName} - {role}</div>
                    {inv.message && <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{inv.message}</div>}
                    <div className="mt-2 flex items-center gap-2">
                      <button className="px-2.5 py-1.5 rounded bg-black text-white text-xs" onClick={() => accept(inv)}>
                        Accept
                      </button>
                      {link && (
                        <Link className="px-2.5 py-1.5 rounded border text-xs" href={link}>
                          Open
                        </Link>
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
