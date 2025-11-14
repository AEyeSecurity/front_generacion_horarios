"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { MessageSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";

type Invite = any;

export default function InvitesMenu() {
  const [items, setItems] = useState<Invite[]>([]);
  const [open, setOpen] = useState(false);
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
    return () => { active = false; };
  }, []);

  async function act(id: number | string, action: "accept" | "decline") {
    const r = await fetch(`/api/invitations/${id}/${action}/`, { method: "POST" });
    if (r.ok) setItems((prev) => prev.filter((it: any) => String(it.id) !== String(id)));
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
              const avatar = sender?.avatar_url || sender?.avatar || sender?.image || "/user.png";
              return (
                <div key={inv.id} className="flex items-start gap-3 p-2 rounded hover:bg-gray-50">
                  <Image src={avatar} alt="" width={28} height={28} className="w-7 h-7 rounded-full object-cover" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{senderName}</div>
                    <div className="text-xs text-gray-600">{gridName} • {role}</div>
                    {inv.message && <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{inv.message}</div>}
                    <div className="mt-2 flex items-center gap-2">
                      <button className="px-2.5 py-1.5 rounded bg-black text-white text-xs" onClick={() => act(inv.id, "accept")}>Accept</button>
                      <button className="px-2.5 py-1.5 rounded border text-xs" onClick={() => act(inv.id, "decline")}>Decline</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

