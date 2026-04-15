"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    const initial = explicit ?? backendPreferredLanguage ?? detectPreferredLanguageFromNavigator();
    setLanguage(initial);
    setLanguageError(null);
  }, [backendPreferredLanguage, userId]);

  useEffect(() => {
    applyDocumentPreferredLanguage(language);
  }, [language]);

  useEffect(() => {
    const explicit = readExplicitPreferredLanguage(userId);
    if (!explicit) return;
    if (backendPreferredLanguage === explicit) {
      writeLastSyncedPreferredLanguage(userId, explicit);
      return;
    }

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
  }, [savePreferredLanguage, userId]);

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
        <div className="rounded-lg border border-gray-200 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("common.language")}</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void onLanguageSelect("en-US")}
              className={`rounded border px-2 py-1.5 text-xs transition-colors ${
                language === "en-US" ? "border-black bg-black text-white" : "border-gray-300 hover:bg-gray-50"
              }`}
              disabled={languageBusy}
            >
              {t("common.english")}
            </button>
            <button
              type="button"
              onClick={() => void onLanguageSelect("es-AR")}
              className={`rounded border px-2 py-1.5 text-xs transition-colors ${
                language === "es-AR" ? "border-black bg-black text-white" : "border-gray-300 hover:bg-gray-50"
              }`}
              disabled={languageBusy}
            >
              {t("common.spanish")}
            </button>
          </div>
          {languageBusy && <div className="mt-2 text-xs text-gray-500">{t("user_menu.saving_language")}</div>}
          {languageError && <div className="mt-2 text-xs text-red-600">{languageError}</div>}
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
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
