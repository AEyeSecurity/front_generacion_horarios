"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import RegisterForm from "@/components/forms/RegisterForm";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { useI18n } from "@/lib/use-i18n";

export default function RegisterBox() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const next = sp.get("next");
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <div className="space-y-4">
      <RegisterForm />
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-500">{t("auth.or")}</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <GoogleSignInButton label={t("auth.google_sign_up")} context="signup" />
      <p className="text-sm text-gray-600">
        {t("auth.already_have_account")} <Link href={loginHref} className="underline">{t("auth.log_in")}</Link>
      </p>
    </div>
  );
}
