"use client";
import { normalizeApiError } from "@/lib/api-errors";


import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

export default function DeleteParticipantButton({
  gridId,
  gridCode,
  participantId,
}: {
  gridId: number | string;
  gridCode?: string | null;
  participantId: number | string;
}) {
  const router = useRouter();
  const { t } = useI18n();

  async function onDelete() {
    const id = String(participantId);
    if (!id || id === "undefined") {
      alert(t("participants.could_not_resolve_id"));
      return;
    }
    if (!window.confirm(t("participants.delete_confirm"))) return;
    const res = await fetch(`/api/participants/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      alert(t("participants.delete_failed_status", { status: res.status, details: normalizeApiError(txt, "", { status: res.status }) }));
      return;
    }
    router.push(`/grid/${encodeURIComponent(gridCode || String(gridId))}`);
    router.refresh();
  }

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 px-3 py-2 rounded border text-red-600 hover:bg-red-50 max-[700px]:h-9 max-[700px]:w-9 max-[700px]:justify-center max-[700px]:px-0"
      onClick={onDelete}
    >
      <Trash2 className="w-4 h-4" />
      <span className="max-[700px]:hidden">{t("participants.delete")}</span>
    </button>
  );
}
