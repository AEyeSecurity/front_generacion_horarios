"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { User } from "@/lib/types";
import { canChangePassword } from "@/lib/account";
import {
  getAvatarDisplayName,
  getAvatarInitials,
  getAvatarPalette,
  getAvatarSeed,
  getAvatarSource,
} from "@/lib/avatar";
import {
  applyDocumentPreferredLanguage,
  detectPreferredLanguageFromNavigator,
  parsePreferredLanguage,
  readExplicitPreferredLanguage,
  readLastSyncedPreferredLanguage,
  type PreferredLanguage,
  writeExplicitPreferredLanguage,
  writeLastSyncedPreferredLanguage,
} from "@/lib/language";
import { useI18n } from "@/lib/use-i18n";

function displayName(me: User): string {
  const name = [me.first_name, me.last_name].filter(Boolean).join(" ");
  if (name) return name;
  // fallback to email local part
  return me.email?.split("@")[0] || "";
}

export default function UserMenu({ me }: { me: User }) {
  const { t } = useI18n();
  const router = useRouter();
  const small = 32; // px
  const large = 64; // px
  const userId = String(me.id);
  const backendPreferredLanguage = useMemo(
    () => parsePreferredLanguage(me.preferred_language),
    [me.preferred_language],
  );
  const src = getAvatarSource(me) || "";
  const [smallBroken, setSmallBroken] = useState(false);
  const [largeBroken, setLargeBroken] = useState(false);
  const [language, setLanguage] = useState<PreferredLanguage>(backendPreferredLanguage ?? "en-US");
  const [languageBusy, setLanguageBusy] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const fallbackName = useMemo(() => getAvatarDisplayName(me), [me]);
  const initials = useMemo(() => getAvatarInitials(fallbackName), [fallbackName]);
  const palette = useMemo(() => getAvatarPalette(getAvatarSeed(me)), [me]);
  const allowPasswordChange = useMemo(() => canChangePassword(me), [me]);
  const activeRequestRef = useRef<string | null>(null);

  const savePreferredLanguage = useCallback(async (nextLanguage: PreferredLanguage) => {
    const response = await fetch("/api/whoami", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferred_language: nextLanguage }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false as const, error: payload.error || t("user_menu.language_save_error") };
    }
    const payload = (await response.json().catch(() => ({}))) as { preferred_language?: unknown };
    return { ok: true as const, language: parsePreferredLanguage(payload.preferred_language) ?? nextLanguage };
  }, [t]);

  useEffect(() => {
    const explicit = readExplicitPreferredLanguage(userId);
    const initial = backendPreferredLanguage ?? explicit ?? detectPreferredLanguageFromNavigator();
    setLanguage(initial);
    setLanguageError(null);
    if (backendPreferredLanguage) {
      writeExplicitPreferredLanguage(userId, backendPreferredLanguage);
      writeLastSyncedPreferredLanguage(userId, backendPreferredLanguage);
    }
  }, [backendPreferredLanguage, userId]);

  useEffect(() => {
    applyDocumentPreferredLanguage(language);
  }, [language]);

  useEffect(() => {
    if (backendPreferredLanguage) return;
    const explicit = readExplicitPreferredLanguage(userId);
    if (!explicit) return;

    const lastSynced = readLastSyncedPreferredLanguage(userId);
    if (lastSynced === explicit) return;

    const requestKey = `explicit:${userId}:${explicit}`;
    if (activeRequestRef.current === requestKey) return;
    activeRequestRef.current = requestKey;
    let active = true;
    setLanguageBusy(true);
    void savePreferredLanguage(explicit).then((result) => {
      if (!active) return;
      setLanguageBusy(false);
      activeRequestRef.current = null;
      if (!result.ok) {
        setLanguageError(result.error);
        return;
      }
      writeLastSyncedPreferredLanguage(userId, result.language);
      setLanguage(result.language);
      setLanguageError(null);
    });
    return () => {
      active = false;
    };
  }, [backendPreferredLanguage, savePreferredLanguage, userId]);

  useEffect(() => {
    const explicit = readExplicitPreferredLanguage(userId);
    if (explicit) return;
    if (backendPreferredLanguage) return;

    const detected = detectPreferredLanguageFromNavigator();
    setLanguage(detected);
    const lastSynced = readLastSyncedPreferredLanguage(userId);
    if (lastSynced === detected) return;

    const requestKey = `auto:${userId}:${detected}`;
    if (activeRequestRef.current === requestKey) return;
    activeRequestRef.current = requestKey;
    let active = true;
    setLanguageBusy(true);
    void savePreferredLanguage(detected).then((result) => {
      if (!active) return;
      setLanguageBusy(false);
      activeRequestRef.current = null;
      if (!result.ok) {
        setLanguageError(result.error);
        return;
      }
      writeLastSyncedPreferredLanguage(userId, result.language);
      setLanguage(result.language);
      setLanguageError(null);
    });
    return () => {
      active = false;
    };
  }, [backendPreferredLanguage, savePreferredLanguage, userId]);

  const onLanguageSelect = useCallback(async (nextLanguage: PreferredLanguage) => {
    writeExplicitPreferredLanguage(userId, nextLanguage);
    setLanguage(nextLanguage);
    setLanguageError(null);
    const requestKey = `explicit:${userId}:${nextLanguage}`;
    activeRequestRef.current = requestKey;
    setLanguageBusy(true);
    const result = await savePreferredLanguage(nextLanguage);
    setLanguageBusy(false);
    activeRequestRef.current = null;
    if (!result.ok) {
      setLanguageError(result.error);
      return;
    }
    writeLastSyncedPreferredLanguage(userId, result.language);
    setLanguage(result.language);
    router.refresh();
  }, [router, savePreferredLanguage, userId]);

  const SmallAvatar = (
    <div
      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-xs font-semibold leading-none"
      style={{ backgroundColor: palette.background, color: palette.text }}
      title={fallbackName}
    >
      <span className="translate-y-px">{initials}</span>
    </div>
  );
  const LargeAvatar = (
    <div
      className="w-16 h-16 rounded-full border border-gray-300 flex items-center justify-center text-xl font-semibold leading-none"
      style={{ backgroundColor: palette.background, color: palette.text }}
      title={fallbackName}
    >
      <span className="translate-y-px">{initials}</span>
    </div>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="w-8 h-8 rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-black/20"
          aria-label={t("user_menu.aria_label")}
        >
          {!src || smallBroken ? (
            SmallAvatar
          ) : (
            <img
              src={src}
              alt={t("user_menu.avatar_alt")}
              width={small}
              height={small}
              className="w-8 h-8 object-cover rounded-full"
              referrerPolicy="no-referrer"
              onError={() => setSmallBroken(true)}
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[18rem] p-4 space-y-3">
        <div className="text-center">
          <div className="text-sm text-gray-700 break-all">{me.email}</div>
        </div>
        <div className="flex items-center justify-center">
          {!src || largeBroken ? (
            LargeAvatar
          ) : (
            <img
              src={src}
              alt={t("user_menu.avatar_alt")}
              width={large}
              height={large}
              className="w-16 h-16 rounded-full object-cover"
              referrerPolicy="no-referrer"
              onError={() => setLargeBroken(true)}
            />
          )}
        </div>
        <div className="text-center">
          <div className="text-base font-semibold">{displayName(me)}</div>
        </div>
        <div className="pt-2">
          {allowPasswordChange && (
            <>
              <DropdownMenuItem asChild className="cursor-pointer justify-center">
                <Link href="/password-change">
                  {t("user_menu.change_password")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <form action="/api/auth/logout" method="post" className="w-full">
            <button
              type="submit"
              className="w-full px-4 py-2 rounded-full border text-sm hover:bg-gray-50"
            >
              {t("user_menu.log_out")}
            </button>
          </form>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => void onLanguageSelect(language === "en-US" ? "es-AR" : "en-US")}
              className={`relative h-6 w-10 rounded-full border p-0 transition-all duration-200 hover:scale-[1.02] ${
                languageBusy ? "opacity-90 animate-pulse" : ""
              }`}
              style={{
                color: "#111827",
                backgroundColor: "rgba(255,255,255,0.9)",
                borderColor: "rgba(209,213,219,0.95)",
                boxShadow:
                  "inset 1.5px 1.5px 3px rgba(15,23,42,0.14), inset -1.5px -1.5px 3px rgba(255,255,255,0.72), 0 1px 3px rgba(0,0,0,0.16)",
              }}
              title={`${t("common.language")}: ${language === "en-US" ? "EN" : "ES"}`}
              aria-busy={languageBusy}
              disabled={languageBusy}
            >
              <span
                className={`pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-semibold tracking-wide transition-opacity duration-200 ${
                  language === "en-US" ? "opacity-100" : "opacity-45"
                }`}
              >
                EN
              </span>
              <span
                className={`pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-semibold tracking-wide transition-opacity duration-200 ${
                  language === "es-AR" ? "opacity-100" : "opacity-45"
                }`}
              >
                ES
              </span>
              <span
                className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full border transition-transform duration-200 ease-out"
                style={{
                  backgroundColor: "#f8fafc",
                  borderColor: "rgba(203,213,225,0.95)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.3)",
                  transform: `translateX(${language === "en-US" ? 0 : 16}px)`,
                }}
              />
            </button>
          </div>
          {languageBusy && <div className="mt-2 text-right text-xs text-gray-500">{t("user_menu.saving_language")}</div>}
          {languageError && <div className="mt-2 text-right text-xs text-red-600">{languageError}</div>}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
