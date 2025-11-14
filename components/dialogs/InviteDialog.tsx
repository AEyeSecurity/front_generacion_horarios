"use client";

import * as React from "react";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

type Role = "viewer" | "supervisor";

export default function InviteDialog({
  gridId,
  open,
  onOpenChange,
}: {
  gridId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("viewer");
  const [message, setMessage] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!email.trim()) { setErr("Email is required"); return; }
    setSaving(true);
    try {
      // Lookup by email -> user id
      const ures = await fetch(`/api/users?search=${encodeURIComponent(email.trim())}`, { cache: "no-store" });
      if (!ures.ok) throw new Error("User lookup failed");
      const udata = await ures.json().catch(() => ({}));
      const list = Array.isArray(udata) ? udata : udata.results ?? [];
      const found = list.find((u: any) => (u.email || "").toLowerCase() === email.trim().toLowerCase());
      if (!found?.id) throw new Error("No user found with that email");

      const res = await fetch(`/api/invitations/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grid: gridId, to_user_id: Number(found.id), role, message }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j === "object" ? JSON.stringify(j) : String(j));
      }
      onOpenChange(false);
      setEmail(""); setMessage(""); setRole("viewer");
    } catch (e: any) {
      setErr(e?.message || "Failed to send invite");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 bg-black/50 z-[95] data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <DialogContent className="sm:max-w-[560px] z-[96]">
          <DialogHeader>
            <DialogTitle>Share grid</DialogTitle>
            <DialogDescription>Invite a user as viewer or supervisor.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1">Email</label>
              <input className="w-full border rounded px-3 py-2 text-sm" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">Role</label>
              <div className="flex gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="role" value="viewer" checked={role==="viewer"} onChange={()=>setRole("viewer")} /> Viewer
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="role" value="supervisor" checked={role==="supervisor"} onChange={()=>setRole("supervisor")} /> Supervisor
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm mb-1">Message (optional)</label>
              <textarea className="w-full border rounded px-3 py-2 text-sm" value={message} onChange={(e)=>setMessage(e.target.value)} rows={3} />
            </div>
            {err && <div className="text-sm text-red-600 whitespace-pre-wrap">{err}</div>}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <button type="button" className="px-3 py-2 rounded border text-sm">Cancel</button>
              </DialogClose>
              <button type="submit" className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50" disabled={saving}>
                {saving ? "Sending..." : "Send invite"}
              </button>
            </div>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
