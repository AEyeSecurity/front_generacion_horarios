"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import LoginForm from "@/components/forms/LoginForm";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { useI18n } from "@/lib/use-i18n";

export default function LoginBox() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const next = sp.get("next");
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";

  return (
    <div className="space-y-4">
      <LoginForm />
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-500">{t("auth.or")}</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <GoogleSignInButton context="signin" />
      <p className="text-sm text-gray-600">
        {t("auth.no_account_prompt")} <Link href={registerHref} className="underline">{t("auth.create_one")}</Link>
      </p>
    </div>
  );
}
