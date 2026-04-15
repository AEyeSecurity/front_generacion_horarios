export const SUPPORTED_PREFERRED_LANGUAGES = ["en-US", "es-AR"] as const;
export const PREFERRED_LANGUAGE_CHANGED_EVENT = "shift:preferred-language:changed";

export type PreferredLanguage = (typeof SUPPORTED_PREFERRED_LANGUAGES)[number];

const EXPLICIT_LANGUAGE_KEY_PREFIX = "shift:preferred-language:explicit:";
const LAST_SYNCED_LANGUAGE_KEY_PREFIX = "shift:preferred-language:last-synced:";

function toUserKey(userId: string | number): string {
  return String(userId);
}

export function parsePreferredLanguage(value: unknown): PreferredLanguage | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "es-ar" || normalized.startsWith("es-")) return "es-AR";
  if (normalized === "en-us" || normalized.startsWith("en-")) return "en-US";
  if (normalized === "es") return "es-AR";
  if (normalized === "en") return "en-US";
  return null;
}

export function normalizePreferredLanguage(value: unknown): PreferredLanguage {
  return parsePreferredLanguage(value) ?? "en-US";
}

export function detectPreferredLanguageFromNavigator(): PreferredLanguage {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "en-US";
  const candidates = [navigator.language, ...(Array.isArray(navigator.languages) ? navigator.languages : [])];
  for (const candidate of candidates) {
    const parsed = parsePreferredLanguage(candidate);
    if (parsed) return parsed;
  }
  return "en-US";
}

export function readExplicitPreferredLanguage(userId: string | number): PreferredLanguage | null {
  if (typeof window === "undefined") return null;
  try {
    return parsePreferredLanguage(window.localStorage.getItem(`${EXPLICIT_LANGUAGE_KEY_PREFIX}${toUserKey(userId)}`));
  } catch {
    return null;
  }
}

export function writeExplicitPreferredLanguage(userId: string | number, language: PreferredLanguage): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${EXPLICIT_LANGUAGE_KEY_PREFIX}${toUserKey(userId)}`, language);
  } catch {}
}

export function readLastSyncedPreferredLanguage(userId: string | number): PreferredLanguage | null {
  if (typeof window === "undefined") return null;
  try {
    return parsePreferredLanguage(window.localStorage.getItem(`${LAST_SYNCED_LANGUAGE_KEY_PREFIX}${toUserKey(userId)}`));
  } catch {
    return null;
  }
}

export function writeLastSyncedPreferredLanguage(userId: string | number, language: PreferredLanguage): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${LAST_SYNCED_LANGUAGE_KEY_PREFIX}${toUserKey(userId)}`, language);
  } catch {}
}

export function readDocumentPreferredLanguage(): PreferredLanguage {
  if (typeof document === "undefined") return "en-US";
  return normalizePreferredLanguage(document.documentElement.lang);
}

export function applyDocumentPreferredLanguage(language: PreferredLanguage): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const normalized = normalizePreferredLanguage(language);
  document.documentElement.lang = normalized;
  window.dispatchEvent(
    new CustomEvent<{ language: PreferredLanguage }>(PREFERRED_LANGUAGE_CHANGED_EVENT, {
      detail: { language: normalized },
    }),
  );
}

