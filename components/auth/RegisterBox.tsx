"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import RegisterForm from "@/components/forms/RegisterForm";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function RegisterBox() {
  const sp = useSearchParams();
  const next = sp.get("next");
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <div className="space-y-4">
      <RegisterForm />
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-500">or</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <GoogleSignInButton label="Sign up with Google" context="signup" />
      <p className="text-sm text-gray-600">
        Already have an account? <Link href={loginHref} className="underline">Log in</Link>
      </p>
    </div>
  );
}
