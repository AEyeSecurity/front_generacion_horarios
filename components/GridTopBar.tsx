// components/GridTopBar.tsx
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import GridActions from "@/components/GridActions";
import UserMenu from "@/components/UserMenu";

export default async function GridTopBar({ id, name, canDelete = false }: { id: number; name: string; canDelete?: boolean }) {
  const me = await getCurrentUser();
  return (
    <div className="w-full border-b bg-white">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0" title="Back to dashboard">
            <CalendarDays className="w-5 h-5" aria-hidden />
          </Link>
          <span className="font-medium truncate" title={name}>{name}</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-3 py-1.5 rounded border text-sm">Share</button>
          {me && <UserMenu me={me} />}
          <GridActions gridId={id} canDelete={canDelete} />
        </div>
      </div>
    </div>
  );
}
