import type { PreferredLanguage } from "@/lib/language";

export type DateTimeInput = Date | string | number | null | undefined;

function parseDateTime(value: DateTimeInput): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

/** Calendar dates are always rendered in the product's Argentine order. */
export function formatArgentineDate(value: DateTimeInput, fallback = ""): string {
  const date = parseDateTime(value);
  if (!date) return fallback;
  return `${padDatePart(date.getDate())}/${padDatePart(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatLocalizedTime(
  value: DateTimeInput,
  locale: PreferredLanguage,
  fallback = "",
): string {
  const date = parseDateTime(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(locale, {
    hour: locale === "en-US" ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12: locale === "en-US",
  }).format(date);
}

export function formatArgentineDateTime(
  value: DateTimeInput,
  locale: PreferredLanguage,
  fallback = "",
): string {
  const date = parseDateTime(value);
  if (!date) return fallback;
  return `${formatArgentineDate(date)}, ${formatLocalizedTime(date, locale)}`;
}

export function formatRelativeTime(
  value: DateTimeInput,
  locale: PreferredLanguage,
  options: { now?: number; justNowLabel?: string } = {},
): string {
  const date = parseDateTime(value);
  if (!date) return "";

  const diffMs = date.getTime() - (options.now ?? Date.now());
  const absSeconds = Math.abs(diffMs) / 1000;
  if (absSeconds < 45) {
    return options.justNowLabel ?? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "second");
  }

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  const [unit, secondsPerUnit] = units.find(([, seconds]) => absSeconds >= seconds) ?? ["minute", 60];
  const amount = Math.round(diffMs / 1000 / secondsPerUnit);
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(amount, unit);
}
