"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { detectPreferredLanguageFromNavigator } from "@/lib/language";
import { useI18n } from "@/lib/use-i18n";

declare global {
  interface Window {
    google?: any;
  }
}

export default function GoogleSignInButton({
  label,
  context = "signin" as "signin" | "signup",
}: {
  label?: string;
  context?: "signin" | "signup";
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";
  const fallbackLabel = label || t("auth.google_sign_in");

  useEffect(() => {
    if (window.google) {
      setReady(true);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => setReady(true);
    s.onerror = () => setErr(t("auth.google_sdk_load_failed"));
    document.head.appendChild(s);
  }, [t]);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!ready || !ref.current) return;
    if (!window.google) {
      setErr(t("auth.google_sdk_unavailable"));
      return;
    }
    if (!clientId) {
      setErr(t("auth.google_client_id_missing"));
      return;
    }
    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: "popup",
        context,
        callback: async (resp: any) => {
          const id_token = resp?.credential;
          if (!id_token) {
            setErr(t("auth.google_credential_missing"));
            return;
          }
          const preferredLanguage = detectPreferredLanguageFromNavigator();
          const r = await fetch("/api/auth/google", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id_token, preferred_language: preferredLanguage }),
          });
          if (!r.ok) {
            let code = t("auth.login_failed");
            try {
              const j = await r.json();
              const status = (j && j.status) || r.status;
              code = (j?.code || j?.error || j?.message || code) + (status ? ` (${status})` : "");
              // eslint-disable-next-line no-console
              console.error("/api/auth/google error", j);
            } catch {
              // ignore response parsing failures
            }
            setErr(String(code));
            return;
          }
          router.replace(next);
          router.refresh();
        },
      });

      window.google.accounts.id.renderButton(ref.current, {
        theme: "outline",
        size: "large",
        type: "standard",
        shape: "pill",
        text: context === "signup" ? "signup_with" : "signin_with",
      });
      setRendered(true);
    } catch (error: unknown) {
      setErr(error instanceof Error && error.message ? error.message : t("auth.google_init_failed"));
    }
  }, [context, next, ready, router, t]);

  return (
    <div className="space-y-2">
      {!rendered && (
        <button
          type="button"
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded border text-sm"
          disabled
          title={err || (!ready ? t("auth.loading_google") : "")}
        >
          {fallbackLabel}
        </button>
      )}
      <div ref={ref} className={`flex justify-center ${rendered ? "" : "hidden"}`} />
      {err && <div className="text-xs text-red-600 text-center">{err}</div>}
    </div>
  );
}
