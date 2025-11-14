// components/NavBar.tsx
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import UserMenu from "@/components/UserMenu";
import InvitesMenu from "@/components/InvitesMenu";
import { CalendarDays } from "lucide-react";


export const dynamic = "force-dynamic"; // 🔑 re-render en cada request

export default async function NavBar() {
  const me = await getCurrentUser();

  return (
    <nav className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-6 h-6" aria-hidden />
          <Link href="/dashboard" className="text-xl font-semibold">Shift</Link>
        </div>
        <div className="flex items-center gap-4">
          {me ? (
            <>
              <InvitesMenu />
              <UserMenu me={me} />
            </>
          ) : (
            <form action="/login" method="get">
              <button className="inline-flex items-center px-4 py-2 rounded bg-black text-white text-sm">Log In</button>
            </form>
          )}
        </div>
      </div>
    </nav>
  );
}
