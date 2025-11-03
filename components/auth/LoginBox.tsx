"use client";

import Link from "next/link";
import LoginForm from "@/components/forms/LoginForm";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function LoginBox() {
  return (
    <div className="space-y-4">
      <LoginForm />
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-500">or</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <GoogleSignInButton context="signin" />
      <p className="text-sm text-gray-600">
        Don’t have an account? <Link href="/register" className="underline">Create one</Link>
      </p>
    </div>
  );
}
