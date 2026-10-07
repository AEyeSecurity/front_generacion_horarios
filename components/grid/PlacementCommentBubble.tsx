"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { getAvatarInitials, getAvatarPalette } from "@/lib/avatar";
import type { PreferredLanguage } from "@/lib/language";

type PlacementCommentBubbleProps = {
  text: string;
  createdAt?: string | null;
  authorId?: string | number | null;
  authorName?: string | null;
  authorAvatarUrl?: string | null;
  currentUserId?: string | number | null;
  currentUserAvatarUrl?: string | null;
  locale: PreferredLanguage;
  youLabel: string;
  justNowLabel: string;
  fallbackAuthorLabel: string;
};

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

function CommentAvatar({
  name,
  src,
}: {
  name: string;
  src?: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const palette = useMemo(() => getAvatarPalette(name || "comment-author"), [name]);

  return (
    <div
      className="relative mt-5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white text-[11px] font-semibold shadow-sm"
      style={{ backgroundColor: palette.background, color: palette.text }}
      aria-label={name}
    >
      {src && !imageFailed ? (
        <Image
          src={src}
          alt=""
          width={36}
          height={36}
          unoptimized
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        getAvatarInitials(name)
      )}
    </div>
  );
}

export default function PlacementCommentBubble({
  text,
  createdAt,
  authorId,
  authorName,
  authorAvatarUrl,
  currentUserId,
  currentUserAvatarUrl,
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
  const avatarUrl = authorAvatarUrl || (isMine ? currentUserAvatarUrl : null);
  const relativeTime = formatRelativeTime(createdAt, locale, justNowLabel);

  return (
    <div className={`flex w-full items-start gap-3 py-1 ${isMine ? "justify-end" : "justify-start"}`}>
      {!isMine && <CommentAvatar name={displayName} src={avatarUrl} />}
      <div className={`flex min-w-0 max-w-[78%] flex-col ${isMine ? "items-end" : "items-start"}`}>
        <div className={`mb-1 flex items-center gap-2 px-1 text-[11px] ${isMine ? "justify-end text-gray-600" : "text-gray-500"}`}>
          <span className="font-semibold text-gray-700">{displayName}</span>
          {relativeTime && <span>{relativeTime}</span>}
        </div>
        <div
          className={[
            "relative min-w-10 rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
            isMine
              ? "bg-black text-white"
              : "border border-gray-200 bg-white text-gray-900",
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-3 h-3 w-3 rotate-45",
              isMine
                ? "-right-1.5 bg-black"
                : "-left-1.5 border-b border-l border-gray-200 bg-white",
            ].join(" ")}
            aria-hidden="true"
          />
          <div className="relative whitespace-pre-wrap leading-relaxed">{text}</div>
        </div>
      </div>
      {isMine && <CommentAvatar name={authorName?.trim() || displayName} src={avatarUrl} />}
    </div>
  );
}
