"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { User } from "@/lib/types";
import { canChangePassword } from "@/lib/account";
import {
  getAvatarDisplayName,
  getAvatarInitials,
  getAvatarPalette,
  getAvatarSeed,
  getAvatarSource,
} from "@/lib/avatar";

function displayName(me: User): string {
  const name = [me.first_name, me.last_name].filter(Boolean).join(" ");
  if (name) return name;
  // fallback to email local part
  return me.email?.split("@")[0] || "";
}

export default function UserMenu({ me }: { me: User }) {
  const small = 32; // px
  const large = 64; // px
  const src = getAvatarSource(me) || "";
  const [smallBroken, setSmallBroken] = useState(false);
  const [largeBroken, setLargeBroken] = useState(false);
  const fallbackName = useMemo(() => getAvatarDisplayName(me), [me]);
  const initials = useMemo(() => getAvatarInitials(fallbackName), [fallbackName]);
  const palette = useMemo(() => getAvatarPalette(getAvatarSeed(me)), [me]);
  const allowPasswordChange = useMemo(() => canChangePassword(me), [me]);

  const SmallAvatar = (
    <div
      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-xs font-semibold leading-none"
      style={{ backgroundColor: palette.background, color: palette.text }}
      title={fallbackName}
    >
      <span className="translate-y-px">{initials}</span>
    </div>
  );
  const LargeAvatar = (
    <div
      className="w-16 h-16 rounded-full border border-gray-300 flex items-center justify-center text-xl font-semibold leading-none"
      style={{ backgroundColor: palette.background, color: palette.text }}
      title={fallbackName}
    >
      <span className="translate-y-px">{initials}</span>
    </div>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="w-8 h-8 rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-black/20"
          aria-label="User menu"
        >
          {!src || smallBroken ? (
            SmallAvatar
          ) : (
            <img
              src={src}
              alt="Avatar"
              width={small}
              height={small}
              className="w-8 h-8 object-cover rounded-full"
              referrerPolicy="no-referrer"
              onError={() => setSmallBroken(true)}
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[18rem] p-4 space-y-3">
        <div className="text-center">
          <div className="text-sm text-gray-700 break-all">{me.email}</div>
        </div>
        <div className="flex items-center justify-center">
          {!src || largeBroken ? (
            LargeAvatar
          ) : (
            <img
              src={src}
              alt="Avatar"
              width={large}
              height={large}
              className="w-16 h-16 rounded-full object-cover"
              referrerPolicy="no-referrer"
              onError={() => setLargeBroken(true)}
            />
          )}
        </div>
        <div className="text-center">
          <div className="text-base font-semibold">{displayName(me)}</div>
        </div>
        <div className="pt-2">
          {allowPasswordChange && (
            <>
              <DropdownMenuItem asChild className="cursor-pointer justify-center">
                <Link href="/password-change">
                  Change Password
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
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
