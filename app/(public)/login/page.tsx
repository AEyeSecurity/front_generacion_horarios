"use client";

import LoginBox from "@/components/auth/LoginBox"; //import
import { useI18n } from "@/lib/use-i18n";

export default function LoginPage() {
  const { t } = useI18n();
  return (
    <div className="max-w-sm mx-auto mt-16 bg-white p-6 rounded-lg shadow">
      <h1 className="text-xl font-semibold mb-4">{t("auth.log_in")}</h1>
      <LoginBox />
    </div>
  );
}
