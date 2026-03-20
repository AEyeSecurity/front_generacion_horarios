// components/NavBar.tsx
import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import { getCurrentUser } from "@/lib/auth";
import UserMenu from "@/components/UserMenu";
import InvitesMenu from "@/components/InvitesMenu";

export const dynamic = "force-dynamic";

const sourceSerif = localFont({
  src: [
    { path: "../app/fonts/source-serif/SourceSerif4-Regular.ttf", weight: "400", style: "normal" },
    { path: "../app/fonts/source-serif/SourceSerif4-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../app/fonts/source-serif/SourceSerif4-Bold.ttf", weight: "700", style: "normal" },
  ],
  display: "swap",
});

export default async function NavBar() {
  const me = await getCurrentUser();
  const logoHref = me ? "/dashboard" : "/";

  return (
    <nav className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-2">
          <Image src="/shift_min.png" alt="Shift logo" width={28} height={28} className="h-7 w-7 object-contain" priority />
          <Link
            href={logoHref}
            className={`${sourceSerif.className} text-xl font-bold`}
          >
            Shift
          </Link>
        </div>
        <div className="flex items-center gap-4">
          {me ? (
            <>
              <InvitesMenu me={me} />
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
