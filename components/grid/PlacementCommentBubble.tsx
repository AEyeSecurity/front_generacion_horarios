"use client";

import type { PreferredLanguage } from "@/lib/language";

type PlacementCommentBubbleProps = {
  text: string;
  createdAt?: string | null;
  authorId?: string | number | null;
  authorName?: string | null;
  currentUserId?: string | number | null;
  locale: PreferredLanguage;
  youLabel: string;
  justNowLabel: string;
  fallbackAuthorLabel: string;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function formatRelativeTime(createdAt: string | null | undefined, locale: PreferredLanguage, justNowLabel: string) {
  if (!createdAt) return "";
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return "";

  const diffMs = timestamp - Date.now();
  const absSeconds = Math.abs(diffMs) / 1000;
  if (absSeconds < 45) return justNowLabel;

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];

  const [unit, secondsPerUnit] = units.find(([, seconds]) => absSeconds >= seconds) ?? ["minute", 60];
  const value = Math.round(diffMs / 1000 / secondsPerUnit);
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(value, unit);
}

export default function PlacementCommentBubble({
  text,
  createdAt,
  authorId,
  authorName,
  currentUserId,
  locale,
  youLabel,
  justNowLabel,
  fallbackAuthorLabel,
}: PlacementCommentBubbleProps) {
  const isMine =
    currentUserId != null &&
    authorId != null &&
    String(currentUserId) === String(authorId);
  const displayName = isMine ? youLabel : (authorName?.trim() || fallbackAuthorLabel);
  const relativeTime = formatRelativeTime(createdAt, locale, justNowLabel);

  return (
    <div className={`flex w-full items-start gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
      {!isMine && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 shadow-sm">
          {getInitials(displayName)}
        </div>
      )}
      <div className={`max-w-[82%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
        <div className={`mb-1 flex items-center gap-2 text-[11px] ${isMine ? "justify-end text-gray-600" : "text-gray-500"}`}>
          <span className="font-semibold text-gray-700">{displayName}</span>
          {relativeTime && <span>{relativeTime}</span>}
        </div>
        <div
          className={[
            "relative rounded-2xl px-3 py-2 text-sm shadow-sm",
            isMine
              ? "rounded-tr-md bg-black text-white"
              : "rounded-tl-md border border-gray-200 bg-white text-gray-900",
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-3 h-3 w-3 rotate-45",
              isMine
                ? "-left-1.5 bg-black"
                : "-left-1.5 border-b border-l border-gray-200 bg-white",
            ].join(" ")}
            aria-hidden="true"
          />
          <div className="relative whitespace-pre-wrap leading-relaxed">{text}</div>
        </div>
      </div>
      {isMine && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-800 bg-black text-[11px] font-semibold text-white shadow-sm">
          {getInitials(displayName)}
        </div>
      )}
    </div>
  );
}
