// components/GridTopBar.tsx
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import GridActions from "@/components/GridActions";
import UserMenu from "@/components/UserMenu";
import ShareInviteButton from "@/components/ShareInviteButton";

export default async function GridTopBar({
  id,
  name,
  canDelete = false,
  canInvite = false,
  hasSolution = false,
  canConfigureSolve = false,
}: {
  id: number;
  name: string;
  canDelete?: boolean;
  canInvite?: boolean;
  hasSolution?: boolean;
  canConfigureSolve?: boolean;
}) {
  const me = await getCurrentUser();
  return (
    <div className="w-full border-b bg-white">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0" title="Back to dashboard">
            <Image src="/shift_min.png" alt="Shift logo" width={20} height={20} className="h-5 w-5 object-contain" priority />
          </Link>
          <span className="font-medium truncate" title={name}>{name}</span>
        </div>
        <div className="flex items-center gap-3">
          {canInvite && (
            <ShareInviteButton
              gridId={id}
              disabled={!canInvite}
              roleOptions={hasSolution ? ["viewer", "supervisor"] : ["supervisor"]}
            />
          )}
          {me && <UserMenu me={me} />}
          {(hasSolution || canConfigureSolve) && (
            <GridActions gridId={id} canDelete={canDelete} canConfigureSolve={canConfigureSolve} />
          )}
        </div>
      </div>
    </div>
  );
}
