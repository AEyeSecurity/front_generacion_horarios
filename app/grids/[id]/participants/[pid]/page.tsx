// app/grids/[id]/participants/[pid]/page.tsx
import { backendFetchJSON } from "@/lib/backend";
import type { Grid } from "@/lib/types";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AddRuleButton from "@/components/AddRuleButton";
import DeleteParticipantButton from "@/components/DeleteParticipantButton";

type Rule = {
  id: number;
  participant: number;
  day_of_week: number; // 0=Mon .. 6=Sun
  start_time: string;  // "HH:MM"
  end_time: string;    // "HH:MM"
  preference: "preferred" | "flexible" | "impossible";
};

const EN_DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Normaliza "HH:MM[:SS]" -> "HH:MM"
const norm = (t: string) => {
  const [h, m] = t.split(":");
  return `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
};

export default async function ParticipantAvailabilityPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id, pid } = await params;

  // --- helpers ---
  const fetchGridSmart = async (gridId: string): Promise<Grid> => {
    try {
      return await backendFetchJSON<Grid>(`/api/grids/${gridId}/`);
    } catch {
      return await backendFetchJSON<Grid>(`/api/grids/${gridId}`);
    }
  };

  const fetchParticipantName = async (participantId: string) => {
    try {
      const p = await backendFetchJSON<{ id: number; name: string; surname?: string }>(
        `/api/participants/${participantId}/`
      );
      return `${p.name}${p.surname ? " " + p.surname : ""}`;
    } catch {
      return `#${participantId}`;
    }
  };

  const fetchRules = async (participantId: string): Promise<Rule[]> => {
    // Usa el proxy con underscore y filtra por participante
    try {
      const data = await backendFetchJSON<any>(
        `/api/availability-rules/?participant=${participantId}`
      );
      const items = Array.isArray(data) ? data : data.results ?? [];
      return items.map((r: any) => ({
        id: r.id,
        participant: r.participant,
        day_of_week: r.day_of_week,
        start_time: norm(r.start_time),
        end_time: norm(r.end_time),
        preference: r.preference,
      })) as Rule[];
    } catch {
      return [];
    }
  };

  const [grid, participantName, rules] = await Promise.all([
    fetchGridSmart(id),
    fetchParticipantName(pid),
    fetchRules(pid),
  ]);

  // --- time/grid helpers ---
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const steps = (a: number, b: number, s: number) => {
    const out: number[] = [];
    for (let t = a; t <= b; t += s) out.push(t);
    return out;
  };
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const start = toMin(grid.day_start);
  const end = toMin(grid.day_end);
  const total = end - start;
  const rows = steps(start, end, grid.cell_size_min);
  const daysIdx = (grid.days_enabled || []) as number[]; // 0..6
  const days = daysIdx.map((i) => EN_DAY[i] ?? String(i));
  const DAY_COUNT = days.length;

  // Canvas sizes
  const ROW_PX = 64;
  const BODY_H = rows.length * ROW_PX;
  const TIME_COL_PX = 100;

  // Colores por preferencia
  const colorFor = (pref: Rule["preference"]) => {
    switch (pref) {
      case "preferred":
        return { bg: "bg-green-50", text: "text-green-800", bar: "bg-green-400" };
      case "flexible":
        return { bg: "bg-yellow-50", text: "text-yellow-800", bar: "bg-yellow-400" };
      default:
        return { bg: "bg-red-50", text: "text-red-800", bar: "bg-red-400" };
    }
  };

  const visibleRules = rules.filter((r) => daysIdx.includes(r.day_of_week));

  // Para el dialog: pasar límites del grid como "HH:MM"
  const gridStartHHMM = norm(grid.day_start);
  const gridEndHHMM = norm(grid.day_end);

  return (
    <div className="p-4">
      <div className="w-[80%] mx-auto space-y-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/grids/${id}`}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            title="Back to grid"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">{participantName}</h1>
            <p className="text-sm text-gray-500">Availability Rules</p>
          </div>
        </div>

        {/* botón + diálogo (cliente) */}
        <AddRuleButton
          participantId={Number(pid)}
          gridStart={gridStartHHMM}
          gridEnd={gridEndHHMM}
        />
      </div>
      
      {/* calendario con overlay de rules */}
      <div className="border rounded-lg bg-white overflow-hidden shadow-sm">
        {/* header de días */}
        <div className="grid" style={{ gridTemplateColumns: `100px repeat(${DAY_COUNT}, 1fr)` }}>
          <div className="bg-gray-50 border-b h-12" />
          {days.map((d) => (
            <div key={d} className="bg-gray-50 border-b h-12 flex items-center justify-center font-medium">
              {d}
            </div>
          ))}
        </div>

        {/* body con líneas + overlay absoluto */}
        <div
          className="relative max-h-[70vh] overflow-y-auto"
          style={{ ["--time-col" as any]: `${TIME_COL_PX}px` }}
        >
          {rows.map((t) => (
            <div key={t} className="grid" style={{ gridTemplateColumns: `100px repeat(${DAY_COUNT}, 1fr)` }}>
              <div className="border-r border-b h-16 flex items-center justify-center text-xs text-gray-600">
                {fmt(t)}
              </div>
              {days.map((d, j) => (
                <div key={`${t}-${d}`} className={`border-b ${j < DAY_COUNT - 1 ? "border-r" : ""} h-16`} />
              ))}
            </div>
          ))}

          <div className="pointer-events-none absolute inset-0" style={{ height: BODY_H }}>
            {visibleRules.map((r) => {
              const cIdx = daysIdx.indexOf(r.day_of_week);
              if (cIdx < 0) return null;
              const s = toMin(r.start_time);
              const e = toMin(r.end_time);
              const top = ((s - start) / (end - start)) * BODY_H;
              const height = ((e - s) / (end - start)) * BODY_H;
              const left = `calc(var(--time-col) + ${cIdx} * ((100% - var(--time-col)) / ${DAY_COUNT}))`;
              const width = `calc(((100% - var(--time-col)) / ${DAY_COUNT}) - 12px)`;
              const c = colorFor(r.preference);

              return (
                <div key={r.id} className="absolute rounded-md shadow-sm overflow-hidden" style={{ top, left, width, height }}>
                  <div className={`h-full w-full ${c.bg} border border-gray-200`}>
                    <div className={`h-1 w-full ${c.bar}`} />
                    <div className="p-2">
                      <div className={`text-sm font-medium ${c.text}`}>
                        {r.preference === "preferred" ? "Preferred" : r.preference === "flexible" ? "Flexible" : "Impossible"}
                      </div>
                      <div className="text-xs text-gray-600">
                        {norm(r.start_time)} – {norm(r.end_time)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Danger zone: delete participant */}
      <div className="mt-8 p-4 border rounded bg-white flex items-center justify-between">
        <div>
          <div className="font-medium">Danger zone</div>
          <div className="text-sm text-gray-600">Delete this participant and all their availability rules.</div>
        </div>
        <DeleteParticipantButton gridId={id} participantId={pid} />
      </div>
    </div>
    </div>
  );
}

