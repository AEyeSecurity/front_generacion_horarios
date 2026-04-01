"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";

export type EntityPageHeaderProps = {
  title: string;
  backHref: string;
  canCreate?: boolean;
  createLabel?: string;
  onCreateClick?: () => void;
  dialog?: ReactNode;
  rightSlot?: ReactNode;
};

export default function EntityPageHeader({
  title,
  backHref,
  canCreate = false,
  createLabel = "Create",
  onCreateClick,
  dialog,
  rightSlot,
}: EntityPageHeaderProps) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center">
      <div className="flex items-center">
        <Link
          href={backHref}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          title="Back to grid"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
      </div>

      <h1 className="text-2xl font-semibold text-center">{title}</h1>

      <div className="flex justify-end">
        {canCreate && onCreateClick ? (
          <button
            type="button"
            onClick={onCreateClick}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-black text-white text-sm"
          >
            <Plus className="w-4 h-4" />
            {createLabel}
          </button>
        ) : null}
        {rightSlot}
        {dialog}
      </div>
    </div>
  );
}
