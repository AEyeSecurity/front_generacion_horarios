// app/dashboard/page.tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import type { ApiList, Grid } from "@/lib/types";
import { headers } from "next/headers";

type GridsResp = ApiList<Grid> | Grid[];
const norm = (r: GridsResp) => (Array.isArray(r) ? r : (r.results ?? []));

export default async function DashboardPage() {
  const me = await requireUser();

  const h = await headers();
  const cookie = h.get("cookie") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host")!;
  const origin = `${proto}://${host}`;

  const res = await fetch(`${origin}/api/grids`, {
    headers: { cookie },          // 👈 reenviamos cookies del usuario
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load grids (${res.status})`);

  const grids = norm(await res.json());

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-gray-600">Welcome, {me.username}.</p>

      {/* 🔹 Create new grid card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link
          href="/grids/new"
          className="rounded border-dashed border-2 bg-white p-4 flex items-center justify-center hover:bg-gray-50"
        >
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            <span className="text-lg leading-none">+</span> Create new grid
          </span>
        </Link>
      </div>

      {grids.length === 0 ? (
        <div className="text-sm text-gray-500 border rounded bg-white p-4">
          No grids yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {grids.map((g) => (
            <div key={g.id} className="rounded border bg-white p-4">
              <div className="font-medium">{g.name}</div>
              <div className="text-xs text-gray-500">ID: {g.id}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
