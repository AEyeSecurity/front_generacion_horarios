"use client";

import RegisterBox from "@/components/auth/RegisterBox";
import { useI18n } from "@/lib/use-i18n";

export default function RegisterPage() {
  const { t } = useI18n();
  return (
    <div className="max-w-sm mx-auto mt-16 bg-white p-6 rounded-lg shadow">
      <h1 className="text-xl font-semibold mb-4">{t("auth.create_your_account")}</h1>
      <RegisterBox />
    </div>
  );
}
