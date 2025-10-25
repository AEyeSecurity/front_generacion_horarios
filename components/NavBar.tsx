// components/NavBar.tsx
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic"; // 🔑 re-render en cada request

export default async function NavBar() {
  const me = await getCurrentUser();

  async function doLogout() {
    "use server";
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/auth/logout`, {
      method: "POST",
      cache: "no-store",
    });
    redirect("/login"); // vuelve a login y el NavBar se re-renderiza
  }

  return (
    <nav className="w-full border-b bg-white">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
        <Link href="/dashboard" className="font-semibold">Shift</Link>
        <div className="flex items-center gap-4">
          {me ? (
            <>
              <span className="text-sm text-gray-600">{me.username}</span>
              <form action={doLogout}>
                <button className="text-sm underline">Logout</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="text-sm underline">Login</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
