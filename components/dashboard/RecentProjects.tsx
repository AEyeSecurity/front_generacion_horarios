"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { List as ListIcon, Grid as GridIcon, ArrowDownAZ, Clock4, Search, User } from "lucide-react";
import type { Grid } from "@/lib/types";
import { getAvatarInitials, getAvatarPalette, getAvatarSeed } from "@/lib/avatar";

const EN_DAY = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

type View = "grid" | "list";
type Sort = "chrono" | "alpha";
type Member = { id: number; name: string; avatarUrl: string | null };

function toDisplayName(first: string, last: string, fallback: string) {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || fallback;
}

function AvatarStack({ members }: { members: Member[] }) {
  if (!members.length) return null;
  const visible = members.slice(0, 3);
  const overflow = members.length - visible.length;

  return (
    <div className="ml-2 flex items-center shrink-0">
      {visible.map((m, idx) => (
        (() => {
          const palette = getAvatarPalette(getAvatarSeed({ id: m.id, name: m.name }));
          return (
            <div
              key={m.id}
              className={`relative h-6 w-6 rounded-full border border-white bg-gray-200 ${idx === 0 ? "" : "-ml-2"}`}
              title={m.name}
            >
              {m.avatarUrl ? (
                <img
                  src={m.avatarUrl}
                  alt={m.name}
                  className="h-full w-full rounded-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    target.style.display = "none";
                    const fallback = target.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.style.display = "flex";
                  }}
                />
              ) : null}
              <div
                className={`hidden h-full w-full items-center justify-center rounded-full text-[10px] font-semibold ${m.avatarUrl ? "" : "!flex"}`}
                style={{ backgroundColor: palette.background, color: palette.text }}
              >
                {getAvatarInitials(m.name)}
              </div>
            </div>
          );
        })()
      ))}
      {overflow > 0 && (
        <div className="ml-1 flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-semibold text-gray-600">
          +
        </div>
      )}
    </div>
  );
}

export default function RecentProjects({ meId, initialItems }: { meId: number; initialItems: Grid[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("grid");
  const [sort, setSort] = useState<Sort>("chrono");
  const [mineOnly, setMineOnly] = useState(false);
  const [ownerByGrid, setOwnerByGrid] = useState<Record<number, string>>({});
  const [membersByGrid, setMembersByGrid] = useState<Record<number, Member[]>>({});
  const [isSingleColumn, setIsSingleColumn] = useState(false);
  const [canShowListToggle, setCanShowListToggle] = useState(false);

  useEffect(() => {
    const update = () => {
      setIsSingleColumn(window.innerWidth < 640);
      setCanShowListToggle(window.innerWidth >= 1024); // lg: grid can render 4 cards
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const items = useMemo(() => {
    let list = [...initialItems];
    if (mineOnly) {
      list = list.filter((g) => g.creator === meId);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((g) => g.name?.toLowerCase().includes(q));
    }
    if (sort === "alpha") {
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list;
  }, [initialItems, query, sort, mineOnly]);

  useEffect(() => {
    // Resolve creators + collaborators shown in cards/list
    const abort = new AbortController();
    (async () => {
      const ownerUpdates: Record<number, string> = {};
      const memberUpdates: Record<number, Member[]> = {};
      await Promise.all(
        items.map(async (grid) => {
          try {
            const gridId = grid.id;
            const r = await fetch(`/api/grid_memberships/?grid=${gridId}`, { cache: "no-store", signal: abort.signal });
            if (!r.ok) return;
            const data = await r.json();
            const list = Array.isArray(data) ? data : data.results ?? [];

            const byUserId = new Map<number, Member>();
            for (const m of list) {
              const userId = Number(
                m.user_id ??
                  (typeof m.user === "number" ? m.user : m.user?.id)
              );
              if (!Number.isFinite(userId)) continue;
              if (byUserId.has(userId)) continue;

              const first = m.user_first_name ?? m.user?.first_name ?? "";
              const last = m.user_last_name ?? m.user?.last_name ?? "";
              const email = m.user_email ?? m.user?.email ?? `User ${userId}`;
              const avatarUrl =
                m.user_avatar_url ??
                m.user?.avatar_url ??
                m.user?.avatar ??
                m.user?.image ??
                null;

              byUserId.set(userId, {
                id: userId,
                name: toDisplayName(first, last, email),
                avatarUrl: avatarUrl || null,
              });
            }

            const members = Array.from(byUserId.values());
            memberUpdates[gridId] = members.filter((m) => m.id !== meId);

            const creator = members.find((m) => m.id === Number(grid.creator));
            if (creator) {
              ownerUpdates[gridId] = creator.name;
            } else {
              const sup = list.find((m: any) => m.role === "supervisor");
              if (sup) {
                const fn = sup.user_first_name ?? sup.user?.first_name ?? "";
                const ln = sup.user_last_name ?? sup.user?.last_name ?? "";
                ownerUpdates[gridId] = [fn, ln].filter(Boolean).join(" ");
              }
            }
          } catch {}
        })
      );
      if (!abort.signal.aborted) {
        if (Object.keys(ownerUpdates).length) {
          setOwnerByGrid((prev) => ({ ...prev, ...ownerUpdates }));
        }
        if (Object.keys(memberUpdates).length) {
          setMembersByGrid((prev) => ({ ...prev, ...memberUpdates }));
        }
      }
    })();
    return () => abort.abort();
  }, [items, meId]);

  const shouldWrapWeekends = !isSingleColumn;
  const hrefForGrid = (g: Grid) =>
    `/grid/${encodeURIComponent(g.grid_code || String(g.id))}`;

  useEffect(() => {
    if (!canShowListToggle && view === "list") {
      setView("grid");
    }
  }, [canShowListToggle, view]);

  const DayBadges = ({
    days,
    align = "center",
    splitWeekends = false,
  }: {
    days: number[];
    align?: "center" | "left";
    splitWeekends?: boolean;
  }) => {
    const ordered = [...days].sort((a, b) => a - b);
    const chip = (i: number) => (
      <span
        key={i}
        className="text-[10px] font-semibold uppercase border border-gray-300 rounded-sm px-1.5 py-0 tracking-wider"
      >
        {EN_DAY[i] ?? String(i)}
      </span>
    );

    if (splitWeekends && ordered.length === 7) {
      const weekdays = ordered.slice(0, 5);
      const weekends = ordered.slice(5);
      return (
        <div className="mt-1 space-y-1">
          <div className={`flex flex-wrap gap-1 ${align === "left" ? "justify-start" : "justify-center"}`}>
            {weekdays.map(chip)}
          </div>
          <div className={`flex gap-1 ${align === "left" ? "justify-start" : "justify-center"}`}>
            {weekends.map(chip)}
          </div>
        </div>
      );
    }

    return (
      <div className={`mt-1 flex flex-wrap gap-1 ${align === "left" ? "justify-start" : "justify-center"}`}>
        {ordered.map(chip)}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-base font-semibold whitespace-nowrap">Recent Projects</div>
        <div className="flex-1 flex items-center justify-center">
          <div className="relative w-full max-w-md">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full bg-white text-sm rounded-md border px-9 py-2 shadow-sm"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            title={mineOnly ? "Show all projects" : "Show my projects only"}
            className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-gray-100"
          >
            <User className={`w-4 h-4 ${mineOnly ? "text-black" : "text-gray-600"}`} />
          </button>
          <button
            type="button"
            onClick={() => setSort((s) => (s === "chrono" ? "alpha" : "chrono"))}
            title={sort === "chrono" ? "Sort A–Z" : "Sort by recent"}
            className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-gray-100"
          >
            {sort === "chrono" ? <ArrowDownAZ className="w-4 h-4" /> : <Clock4 className="w-4 h-4" />}
          </button>
          {canShowListToggle && (
            <button
              type="button"
              onClick={() => setView((v) => (v === "grid" ? "list" : "grid"))}
              title={view === "grid" ? "List view" : "Card view"}
              className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-gray-100"
            >
              {view === "grid" ? <ListIcon className="w-4 h-4" /> : <GridIcon className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((g) => (
            <Link
              key={g.id}
              href={hrefForGrid(g)}
              className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow p-3 flex flex-col justify-between min-h-[142px]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm font-medium truncate" title={g.name}>{g.name}</div>
                <AvatarStack members={membersByGrid[g.id] || []} />
              </div>
              <DayBadges days={g.days_enabled || []} align="center" splitWeekends={shouldWrapWeekends} />
              <div className="mt-1 text-xs text-gray-600 flex items-center justify-between">
                <span>
                  {g.creator === meId
                    ? "By you"
                    : (ownerByGrid[g.id] || "")}
                </span>
                <span>{new Date(g.created_at).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="grid grid-cols-12 text-xs font-medium text-gray-600 px-3 py-2 border-b bg-gray-50">
            <div className="col-span-6">Title</div>
            <div className="col-span-3">Owner</div>
            <div className="col-span-3 text-right">Created</div>
          </div>
          <div className="divide-y">
            {items.map((g) => (
              <Link key={g.id} href={hrefForGrid(g)} className="grid grid-cols-12 items-center px-3 py-3 hover:bg-gray-50 text-sm">
                <div className="col-span-6 min-w-0">
                  <div className="truncate" title={g.name}>{g.name}</div>
                  <DayBadges days={g.days_enabled || []} align="left" />
                </div>
                <div className="col-span-3 truncate">
                  {g.creator === meId ? "You" : (ownerByGrid[g.id] || "")}
                </div>
                <div className="col-span-3 text-right text-gray-600 text-xs">{new Date(g.created_at).toLocaleDateString()}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
