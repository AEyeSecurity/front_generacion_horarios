"use client";

import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { User } from "@/lib/types";

function avatarSrc(me: User): string {
  const anyMe = me as any;
  return (
    anyMe?.avatar_url || anyMe?.avatar || anyMe?.image || "/user.png"
  );
}

function displayName(me: User): string {
  const name = [me.first_name, me.last_name].filter(Boolean).join(" ");
  if (name) return name;
  // fallback to email local part
  return me.email?.split("@")[0] || "";
}

export default function UserMenu({ me }: { me: User }) {
  const small = 32; // px
  const large = 64; // px
  const src = avatarSrc(me);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="w-8 h-8 rounded-full overflow-hidden border border-gray-300 bg-gray-100 focus:outline-none focus:ring-2 focus:ring-black/20"
          aria-label="User menu"
        >
          <Image src={src} alt="Avatar" width={small} height={small} className="w-8 h-8 object-cover rounded-full" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[18rem] p-4 space-y-3">
        <div className="text-sm text-gray-700 break-all">{me.email}</div>
        <div className="flex items-center justify-center">
          <Image src={src} alt="Avatar" width={large} height={large} className="w-16 h-16 rounded-full object-cover" />
        </div>
        <div className="text-center">
          <div className="text-base font-semibold">Hi, {displayName(me)}!</div>
        </div>
        <div className="pt-2">
          <form action="/api/auth/logout" method="post" className="w-full">
            <button
              type="submit"
              className="w-full px-4 py-2 rounded-full border text-sm hover:bg-gray-50"
            >
              Log Out
            </button>
          </form>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

