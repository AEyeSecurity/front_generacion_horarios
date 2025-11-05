// app/(site)/dashboard/page.tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import type { ApiList, Grid } from "@/lib/types";
import { headers } from "next/headers";
import RecentProjects from "@/components/dashboard/RecentProjects";

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
    headers: { cookie },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load grids (${res.status})`);
  const grids = norm(await res.json());

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Create section */}
      <section className="bg-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <h2 className="text-lg font-semibold mb-4">Create a project</h2>
          <Link
            href="/grids/new"
            className="block w-44 h-56 bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <div className="text-4xl text-gray-400 leading-none">+</div>
              <div className="text-sm text-gray-700">Blank project</div>
            </div>
          </Link>
        </div>
      </section>

      {/* Recent projects */}
      <section className="max-w-6xl mx-auto px-6 py-8">
        <RecentProjects meId={me.id} initialItems={grids} />
      </section>
    </div>
  );
}
