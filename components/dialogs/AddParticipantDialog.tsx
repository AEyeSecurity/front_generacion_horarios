"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { TierBadge, type Tier } from "@/components/badges/TierBadge";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AddParticipantDialog({
  gridId,
  open,
  onOpenChange,
  onCreated,
}: {
  gridId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}) {
  const [first, setFirst] = React.useState("");
  const [last, setLast] = React.useState("");
  const [tier, setTier] = React.useState<Tier>("PRIMARY");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!first.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/participants/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grid: gridId,
          name: first.trim(),
          surname: last.trim(),
          tier,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j === "object" ? JSON.stringify(j) : String(j));
      }
      setFirst("");
      setLast("");
      setTier("PRIMARY");
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      setErr(e.message || "Failed to create participant");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        {/* Overlay por encima del panel lateral */}
        <DialogOverlay className="fixed inset-0 bg-black/50 z-[180] data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <DialogContent className="sm:max-w-[720px] z-[181]">
          <DialogHeader>
            <DialogTitle>Add Participant</DialogTitle>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_112px] gap-3">
              <div>
                <label className="block text-sm mb-1">First name *</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Last name</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={last}
                  onChange={(e) => setLast(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Tier *</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-[42px] w-full min-w-0 items-center justify-center gap-1 overflow-hidden rounded border bg-white px-2 py-2"
                      aria-label="Select tier"
                    >
                      <span className="flex min-w-0 flex-1 items-center justify-center overflow-hidden">
                        <TierBadge tier={tier} compact />
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={6} className="z-[190] min-w-[8rem]">
                    <DropdownMenuItem onClick={() => setTier("PRIMARY")} className="justify-center">
                      <TierBadge tier="PRIMARY" compact />
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTier("SECONDARY")} className="justify-center">
                      <TierBadge tier="SECONDARY" compact />
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTier("TERTIARY")} className="justify-center">
                      <TierBadge tier="TERTIARY" compact />
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {err && <div className="text-sm text-red-600 whitespace-pre-wrap">{err}</div>}

            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <button type="button" className="px-3 py-2 rounded border text-sm">
                  Cancel
                </button>
              </DialogClose>
              <button
                type="submit"
                className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
                disabled={saving}
              >
                {saving ? "Adding…" : "Add"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
