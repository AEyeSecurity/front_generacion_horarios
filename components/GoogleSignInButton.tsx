"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window { google?: any }
}

export default function GoogleSignInButton({ label = "Sign in with Google", context = "signin" as "signin" | "signup" }: { label?: string; context?: "signin" | "signup" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (window.google) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = () => setReady(true);
    s.onerror = () => setErr("Failed to load Google SDK");
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!ready || !ref.current) return;
    if (!window.google) { setErr("Google SDK unavailable"); return; }
    if (!clientId) { setErr("Google client ID not configured"); return; }
    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: "popup",
        context,
        callback: async (resp: any) => {
          const id_token = resp?.credential;
          if (!id_token) { setErr("Missing Google credential"); return; }
          const r = await fetch("/api/auth/google", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id_token }),
          });
          if (!r.ok) {
            let code = "Login failed";
            try {
              const j = await r.json();
              const status = (j && j.status) || r.status;
              code = (j?.code || j?.error || j?.message || code) + (status ? ` (${status})` : "");
              // eslint-disable-next-line no-console
              console.error("/api/auth/google error", j);
            } catch (e) {
              // swallow
            }
            setErr(String(code));
            return;
          }
          router.replace("/dashboard");
          router.refresh();
        },
      });
      // Render a standard Google-styled button
      window.google.accounts.id.renderButton(ref.current, {
        theme: "outline",
        size: "large",
        type: "standard",
        shape: "pill",
        text: context === "signup" ? "signup_with" : "signin_with",
      });
      setRendered(true);
    } catch (e: any) {
      setErr(e?.message || "Google init failed");
    }
  }, [ready, router]);

  return (
    <div className="space-y-2">
      {!rendered && (
        <button
          type="button"
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded border text-sm"
          disabled
          title={err || (!ready ? "Loading Google…" : "")}
        >
          {label}
        </button>
      )}
      <div ref={ref} className={`flex justify-center ${rendered ? "" : "hidden"}`} />
      {err && <div className="text-xs text-red-600 text-center">{err}</div>}
    </div>
  );
}
