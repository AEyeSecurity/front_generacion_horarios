"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

export type EntityPageHeaderProps = {
  title: string;
  subtitle?: React.ReactNode;
  backHref: string;
  canCreate?: boolean;
  createLabel?: string;
  onCreateClick?: () => void;
  dialog?: ReactNode;
  rightSlot?: ReactNode;
};

export default function EntityPageHeader({
  title,
  subtitle,
  backHref,
  canCreate = false,
  onCreateClick,
  dialog,
  rightSlot,
}: EntityPageHeaderProps) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center">
      <div className="flex items-center">
        <Link
          href={backHref}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          title={t("participant_detail.back_to_grid")}
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
      </div>
      <div className="flex flex-col items-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && (
          <p className="text-xs text-gray-500">
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex justify-end">
        {canCreate && onCreateClick ? (
          <button
            type="button"
            onClick={onCreateClick}
            className="inline-flex items-center gap-1 rounded bg-black px-3 py-2 text-sm text-white sm:gap-2 sm:px-4"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline"> {t("common.create")} </span>
          </button>
        ) : null}
        {rightSlot}
        {dialog}
      </div>
    </div>
  );
}
