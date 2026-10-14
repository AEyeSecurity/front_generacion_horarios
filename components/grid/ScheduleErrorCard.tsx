"use client";

import { X } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

type Props = {
  message: string;
  left: number;
  top: number;
  onClose: () => void;
};

export default function ScheduleErrorCard({ message, left, top, onClose }: Props) {
  const { t } = useI18n();
  return (
    <div
      className="fixed z-[170] w-[460px] max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm"
      style={{ left, top }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 break-words">{message}</div>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-red-500 hover:bg-red-100 hover:text-red-700"
          aria-label={t("errors.dismiss")}
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
