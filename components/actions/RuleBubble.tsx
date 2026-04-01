"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
const EditRuleDialog = dynamic(() => import("@/components/dialogs/EditRuleDialog"), { ssr: false });

export default function RuleBubble({
  id,
  title,
  subtitle,
  colors,
  canEdit = false,
}: {
  id: number;
  title: string;
  subtitle: string;
  colors: { bg: string; text: string; bar: string; topBorder?: string };
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);

  async function onDelete() {
    if (busy) return;
    if (!window.confirm("Delete this rule?")) return;
    setBusy(true);
    const res = await fetch(`/api/availability_rules/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      alert(`Failed to delete (${res.status}). ${txt}`);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <div className={`h-full w-full ${colors.bg} border border-gray-200 rounded-md shadow-sm flex flex-col justify-center ${colors.topBorder ?? ""} border-t-4`}> 
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="leading-tight">
            <div className={`text-sm font-medium ${colors.text}`}>{title}</div>
            <div className="text-xs text-gray-600">{subtitle}</div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="p-1 rounded hover:bg-white/50"
                aria-label="Edit rule"
                onClick={() => setOpenEdit(true)}
                disabled={busy}
                title="Edit rule"
                style={{ color: "inherit" }}
              >
                <Pencil className={`w-4 h-4 ${colors.text}`} />
              </button>
              <button
                type="button"
                className="p-1 rounded hover:bg-white/50"
                aria-label="Delete rule"
                onClick={onDelete}
                disabled={busy}
                title="Delete rule"
                style={{ color: "inherit" }}
              >
                <Trash2 className={`w-4 h-4 ${colors.text}`} />
              </button>
            </div>
          )}
        </div>
      </div>
      <EditRuleDialog ruleId={id} open={openEdit} onOpenChange={setOpenEdit} onSaved={() => router.refresh()} />
    </>
  );
}
