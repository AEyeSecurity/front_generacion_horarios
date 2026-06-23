"use client";

import type { ReactNode } from "react";

type EmptyStateProps = {
  message: ReactNode;
  mode?: "panel" | "plain";
  size?: "sm" | "md" | "lg";
  className?: string;
};

const IMAGE_SIZE_CLASS: Record<NonNullable<EmptyStateProps["size"]>, string> = {
  sm: "h-16 w-16",
  md: "h-24 w-24",
  lg: "h-32 w-32",
};

const MIN_HEIGHT_CLASS: Record<NonNullable<EmptyStateProps["mode"]>, string> = {
  panel: "min-h-[180px]",
  plain: "min-h-[260px]",
};

export default function EmptyState({ message, mode = "panel", size = "md", className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 py-6 text-center ${MIN_HEIGHT_CLASS[mode]} ${className}`}>
      <img src="/adobe_empty.png" alt="" aria-hidden="true" className={`${IMAGE_SIZE_CLASS[size]} object-contain opacity-90`} />
      <div className="mt-3 max-w-sm text-sm font-medium text-gray-500">{message}</div>
    </div>
  );
}
