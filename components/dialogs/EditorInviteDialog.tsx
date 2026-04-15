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
import { useI18n } from "@/lib/use-i18n";

export default function EditorInviteDialog({
  gridId,
  participantId,
  open,
  onOpenChange,
}: {
  gridId: number | string;
  participantId: number | string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!email.trim()) { setErr(t("editor_invite.email_required")); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/invitations/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grid: Number(gridId),
          type: "email",
          email: email.trim().toLowerCase(),
          role: "editor",
          participant_id: Number(participantId),
          message,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j === "object" ? JSON.stringify(j) : String(j));
      }
      onOpenChange(false);
      setEmail(""); setMessage("");
    } catch (e: any) {
      setErr(e?.message || t("editor_invite.failed_send_invite"));
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
            <DialogTitle>{t("editor_invite.link_participant_to_user")}</DialogTitle>
            <DialogDescription>{t("editor_invite.send_editor_invite")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1">{t("editor_invite.email")}</label>
              <input className="w-full border rounded px-3 py-2 text-sm" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">{t("editor_invite.message_optional")}</label>
              <textarea className="w-full border rounded px-3 py-2 text-sm" value={message} onChange={(e)=>setMessage(e.target.value)} rows={3} />
            </div>
            {err && <div className="text-sm text-red-600 whitespace-pre-wrap">{err}</div>}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <button type="button" className="px-3 py-2 rounded border text-sm">{t("common.cancel")}</button>
              </DialogClose>
              <button type="submit" className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50" disabled={saving}>
                {saving ? t("editor_invite.sending") : t("common.send_invite")}
              </button>
            </div>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
