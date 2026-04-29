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
  allowLinkSelf = false,
  onLinked,
}: {
  gridId: number | string;
  participantId: number | string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allowLinkSelf?: boolean;
  onLinked?: () => void;
}) {
  const { t } = useI18n();
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [linkingSelf, setLinkingSelf] = React.useState(false);
  const [canShowLinkSelf, setCanShowLinkSelf] = React.useState(allowLinkSelf);
  const [err, setErr] = React.useState<string | null>(null);

  async function loadLinkedParticipantByGrid() {
    const res = await fetch(`/api/participants?grid=${encodeURIComponent(String(gridId))}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ([]));
    const list = Array.isArray(data) ? data : data.results ?? [];
    return Array.isArray(list) ? list : [];
  }

  React.useEffect(() => {
    let active = true;
    if (!open || !allowLinkSelf) {
      setCanShowLinkSelf(false);
      return;
    }
    (async () => {
      try {
        const [whoRes, participants] = await Promise.all([
          fetch("/api/whoami", { cache: "no-store" }),
          loadLinkedParticipantByGrid(),
        ]);
        if (!active) return;
        if (!whoRes.ok) {
          setCanShowLinkSelf(false);
          return;
        }
        const me = await whoRes.json().catch(() => ({} as { id?: number | string }));
        const meId = me?.id;
        if (meId == null || meId === "") {
          setCanShowLinkSelf(false);
          return;
        }
        const linkedToAnyOther = participants.some((p: any) => {
          const pid = String(p?.id ?? "");
          const linkedUserId = p?.user_id ?? (typeof p?.user === "number" ? p.user : p?.user?.id);
          return pid !== String(participantId) && linkedUserId != null && String(linkedUserId) === String(meId);
        });
        const alreadyLinkedToThis = participants.some((p: any) => {
          const pid = String(p?.id ?? "");
          const linkedUserId = p?.user_id ?? (typeof p?.user === "number" ? p.user : p?.user?.id);
          return pid === String(participantId) && linkedUserId != null && String(linkedUserId) === String(meId);
        });
        setCanShowLinkSelf(!linkedToAnyOther && !alreadyLinkedToThis);
      } catch {
        if (active) setCanShowLinkSelf(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [allowLinkSelf, open, participantId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!email.trim()) { setErr(t("editor_invite.email_required")); return; }
    setSaving(true);
    try {
      const participants = await loadLinkedParticipantByGrid();
      const targetEmail = email.trim().toLowerCase();
      const linkedElsewhere = participants.some((p: any) => {
        const pid = String(p?.id ?? "");
        const linkedEmail = String(p?.user?.email ?? p?.user_email ?? "").trim().toLowerCase();
        return pid !== String(participantId) && linkedEmail !== "" && linkedEmail === targetEmail;
      });
      if (linkedElsewhere) {
        throw new Error("This email already has another participant linked in this grid.");
      }

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

  async function linkMyself() {
    setErr(null);
    setLinkingSelf(true);
    try {
      const who = await fetch("/api/whoami", { cache: "no-store" });
      if (!who.ok) {
        throw new Error("Could not load current user.");
      }
      const me = await who.json().catch(() => ({} as { id?: number | string }));
      const meId = me?.id;
      if (meId == null || meId === "") {
        throw new Error("Could not identify current user.");
      }

      const participants = await loadLinkedParticipantByGrid();
      const linkedElsewhere = participants.some((p: any) => {
        const pid = String(p?.id ?? "");
        const linkedUserId = p?.user_id ?? (typeof p?.user === "number" ? p.user : p?.user?.id);
        return pid !== String(participantId) && linkedUserId != null && String(linkedUserId) === String(meId);
      });
      if (linkedElsewhere) {
        throw new Error("You already have another participant linked in this grid.");
      }

      const patchCandidates = [{ user_id: meId }, { user: meId }];
      let patched = false;
      let lastMessage = "";
      for (const payload of patchCandidates) {
        const res = await fetch(`/api/participants/${encodeURIComponent(String(participantId))}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          patched = true;
          break;
        }
        const raw = await res.text().catch(() => "");
        lastMessage = raw || `Failed (${res.status})`;
      }
      if (!patched) throw new Error(lastMessage || "Could not link participant.");

      onOpenChange(false);
      onLinked?.();
    } catch (e: any) {
      setErr(e?.message || "Could not link participant.");
    } finally {
      setLinkingSelf(false);
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
              {canShowLinkSelf && (
                <button
                  type="button"
                  className="px-3 py-2 rounded border text-sm disabled:opacity-50"
                  disabled={linkingSelf || saving}
                  onClick={linkMyself}
                >
                  {linkingSelf ? "Linking..." : "Link myself"}
                </button>
              )}
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
