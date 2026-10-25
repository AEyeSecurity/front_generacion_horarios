// components/GridTopBar.tsx
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import GridActions from "@/components/grid/GridActions";
import UserMenu from "@/components/navigation/UserMenu";
import ShareInviteButton from "@/components/invitations/ShareInviteButton";
import GridTopBarTools from "@/components/navigation/GridTopBarTools";
import { getTranslation } from "@/lib/i18n";

export default async function GridTopBar({
  id,
  gridCode,
  name,
  canDelete = false,
  canLeave = false,
  canInvite = false,
  hasSolution = false,
  canConfigureSolve = false,
  hasPublishedSchedule = false,
}: {
  id: number;
  gridCode?: string | null;
  name: string;
  canDelete?: boolean;
  canLeave?: boolean;
  canInvite?: boolean;
  hasSolution?: boolean;
  canConfigureSolve?: boolean;
  hasPublishedSchedule?: boolean;
}) {
  const me = await getCurrentUser();
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(me?.preferred_language, key);
  const homeHref = me ? "/dashboard" : "/";
  return (
    <div data-grid-topbar className="sticky top-0 z-[1300] w-full border-b bg-white" style={{ zIndex: 1600 }}>
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={homeHref} className="flex items-center gap-2 shrink-0" title={t("nav.back_to_dashboard")}>
            <Image src="/shift_min.png" alt={t("nav.logo_alt")} width={20} height={20} className="h-5 w-5 object-contain" priority />
          </Link>
          <span className="font-medium truncate" title={name}>{name}</span>
        </div>
        <div className="flex items-center gap-3">
          {canInvite && hasSolution && (
            <GridTopBarTools
              gridId={id}
              gridCode={gridCode}
              hasPublishedSchedule={hasPublishedSchedule}
            />
          )}
          {canInvite && (
            <ShareInviteButton
              gridId={id}
              gridName={name}
              disabled={!canInvite}
              roleOptions={hasSolution ? ["viewer", "editor", "supervisor"] : ["supervisor"]}
            />
          )}
          {me && <UserMenu me={me} />}
          {(hasPublishedSchedule || canConfigureSolve || canDelete || canLeave) && (
            <GridActions
              gridId={id}
              gridCode={gridCode}
              canLeave={canLeave}
              canConfigureSolve={canConfigureSolve}
              hasPublishedSchedule={hasPublishedSchedule}
            />
          )}
        </div>
      </div>
    </div>
  );
}
