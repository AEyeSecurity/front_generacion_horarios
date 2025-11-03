"use client";

import Link from "next/link";
import RegisterBox from "@/components/auth/RegisterBox";

export default function RegisterPage() {
  return (
    <div className="max-w-sm mx-auto mt-16 bg-white p-6 rounded-lg shadow">
      <h1 className="text-xl font-semibold mb-4">Create your account</h1>
      <RegisterBox />
    </div>
  );
}
