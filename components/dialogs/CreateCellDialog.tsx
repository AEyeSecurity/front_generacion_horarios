"use client";

import * as React from "react";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

type Participant = { id: number; name: string; surname?: string };
type TimeRange = { id: number; name: string; start_time: string; end_time: string };
type Unit = { id: number; name: string };
type Bundle = { id: number; name: string };

const COLOR_OPTIONS = [
  "#E7180B",
  "#FF692A",
  "#FE9A37",
  "#FDC745",
  "#7CCF35",
  "#31C950",
  "#37BC7D",
  "#36BBA7",
  "#3BB8DB",
  "#34A6F4",
  "#2B7FFF",
  "#615FFF",
  "#8E51FF",
  "#AD46FF",
  "#E12AFB",
  "#F6339A",
  "#FF2056",
];

const COLOR_TEXT_DARK = [
  "#460809",
  "#441306",
  "#461901",
  "#432004",
  "#192E03",
  "#032E15",
  "#012C22",
  "#022F2E",
  "#053345",
  "#052F4A",
  "#162456",
  "#1E1A4D",
  "#2F0D68",
  "#3C0366",
  "#4B004F",
  "#510424",
  "#4D0218",
];

const COLOR_TEXT_LIGHT = [
  "#FFE2E2",
  "#FFEDD4",
  "#FEF3C6",
  "#FEFCE8",
  "#F7FEE7",
  "#DCFCE7",
  "#D0FAE5",
  "#CBFBF1",
  "#CEFAFE",
  "#DFF2FE",
  "#DBEAFE",
  "#E0E7FF",
  "#EDE9FE",
  "#F3E8FF",
  "#FAE8FF",
  "#FCE7F3",
  "#FFE4E6",
];
export default function CreateCellDialog({
  gridId,
  open,
  onOpenChange,
}: {
  gridId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [durationCells, setDurationCells] = React.useState<number>(1);
  const [daysDivision, setDaysDivision] = React.useState<number>(1);
  const [timeRangeId, setTimeRangeId] = React.useState<string>("");
  const [colorHex, setColorHex] = React.useState<string | null>(COLOR_OPTIONS[0]);
  const [colorMenuOpen, setColorMenuOpen] = React.useState(false);

  const [participantIds, setParticipantIds] = React.useState<string[]>([]);
  const [useUnits, setUseUnits] = React.useState<boolean>(true);
  const [unitIds, setUnitIds] = React.useState<string[]>([]);
  const [bundleIds, setBundleIds] = React.useState<string[]>([]);

  const [participants, setParticipants] = React.useState<Participant[]>([]);
  const [timeRanges, setTimeRanges] = React.useState<TimeRange[]>([]);
  const [units, setUnits] = React.useState<Unit[]>([]);
  const [bundles, setBundles] = React.useState<Bundle[]>([]);
  const [cellMin, setCellMin] = React.useState<number>(1);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setErr(null);
    setLoading(true);
    setColorHex(COLOR_OPTIONS[0]);
    setColorMenuOpen(false);
    (async () => {
      try {
        // grid to get cell_size_min
        try {
          let g: any = null;
          try {
            g = await fetch(`/api/grids/${gridId}/`, { cache: "no-store" }).then((r) => r.json());
          } catch {
            g = await fetch(`/api/grids/${gridId}`, { cache: "no-store" }).then((r) => r.json());
          }
          if (g?.cell_size_min) {
            const min = Number(g.cell_size_min);
            setCellMin(min);
            setDurationCells((v) => (v < 1 ? 1 : v));
          }
        } catch {}

        // participants
        try {
          const rp = await fetch(`/api/participants?grid=${gridId}`, { cache: "no-store" });
          const pdata = await rp.json().catch(() => ([]));
          setParticipants(Array.isArray(pdata) ? pdata : pdata.results ?? []);
        } catch {}

        // time ranges
        try {
          const rt = await fetch(`/api/time_ranges?grid=${gridId}`, { cache: "no-store" });
          const tdata = await rt.json().catch(() => ([]));
          setTimeRanges(Array.isArray(tdata) ? tdata : tdata.results ?? []);
        } catch {}

        // units
        try {
          const ru = await fetch(`/api/units?grid=${gridId}`, { cache: "no-store" });
          const udata = await ru.json().catch(() => ([]));
          setUnits(Array.isArray(udata) ? udata : udata.results ?? []);
        } catch {}

        // bundles
        try {
          const rb = await fetch(`/api/bundles?grid=${gridId}`, { cache: "no-store" });
          const bdata = await rb.json().catch(() => ([]));
          setBundles(Array.isArray(bdata) ? bdata : bdata.results ?? []);
        } catch {}
      } catch (e: any) {
        setErr(e?.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, gridId]);

  const canSubmit =
    name.trim() &&
    participantIds.length > 0 &&
    timeRangeId &&
    durationCells >= 1 &&
    (useUnits ? unitIds.length > 0 : bundleIds.length > 0);

  const onMultiChange = (e: React.ChangeEvent<HTMLSelectElement>, setFn: (v: string[]) => void) => {
    const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
    setFn(vals);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setErr(null);
    try {
      // create/reuse staff from participant_ids
      const staffRes = await fetch(`/api/staffs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ participant_ids: participantIds.map(Number) }),
      });
      if (!staffRes.ok) throw new Error(await staffRes.text());
      const staff = await staffRes.json();

      const payload: any = {
        grid: gridId,
        name: name.trim(),
        description: description.trim() || undefined,
        duration_min: Number(durationCells) * Math.max(1, cellMin),
        division_days: Number(daysDivision) || 1,
        time_range: Number(timeRangeId),
        staffs: [Number(staff.id)],
        colorHex: colorHex || undefined,
      };
      if (useUnits) {
        payload.units = unitIds.map(Number);
      } else {
        payload.bundles = bundleIds.map(Number);
      }

      const res = await fetch(`/api/cells`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed (${res.status})`);
      }
      setName("");
      setDescription("");
      setDurationCells(1);
      setDaysDivision(1);
      setParticipantIds([]);
      setUnitIds([]);
      setBundleIds([]);
      setColorHex(COLOR_OPTIONS[0]);
      setColorMenuOpen(false);
      setTimeRangeId("");
      onOpenChange(false);
    } catch (e: any) {
      setErr(e?.message || "Failed to create cell");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 bg-black/50 z-[95]" />
        <DialogContent className="sm:max-w-[760px] z-[96]">
          <DialogHeader>
            <DialogTitle>Create Cell</DialogTitle>
            <DialogDescription>Define details and associations for the new cell.</DialogDescription>
          </DialogHeader>

          {err && <div className="text-sm text-red-600 mb-2 whitespace-pre-wrap">{err}</div>}

          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm mb-1">Name *</label>
                <input className="w-full border rounded px-3 py-2 text-sm" value={name} onChange={(e)=>setName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm mb-1">Duration (in cells) *</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  type="number"
                  min={1}
                  step={1}
                  value={durationCells}
                  onChange={(e)=>setDurationCells(Number(e.target.value))}
                  required
                />
                <div className="text-xs text-gray-500 mt-1">Total minutes: {durationCells * cellMin}</div>
              </div>
              <div>
                <label className="block text-sm mb-1">Division in days</label>
                <input className="w-full border rounded px-3 py-2 text-sm" type="number" min={1} value={daysDivision} onChange={(e)=>setDaysDivision(Number(e.target.value)||1)} />
              </div>
              <div>
                <label className="block text-sm mb-1">Color</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setColorMenuOpen((v) => !v)}
                    className="h-10 w-10 rounded-full border border-gray-300 shadow-sm"
                    style={{ backgroundColor: colorHex || "#ffffff" }}
                    aria-label="Select color"
                  />
                  {colorMenuOpen && (
                    <div className="absolute left-1/2 -translate-x-1/2 z-10 mt-2 rounded-md border bg-white p-2 shadow-lg">
                      <div className="flex items-center gap-2 overflow-x-auto max-w-[360px]">
                        <button
                          type="button"
                          aria-label="No color"
                          onClick={() => {
                            setColorHex(null);
                            setColorMenuOpen(false);
                          }}
                          className="h-8 w-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-500"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </button>
                        {COLOR_OPTIONS.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            aria-label={`Select ${hex}`}
                            onClick={() => {
                              setColorHex(hex);
                              setColorMenuOpen(false);
                            }}
                            className={`h-8 w-8 rounded-full border ${
                              colorHex === hex ? "ring-2 ring-black border-black" : "border-gray-300"
                            }`}
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1">Description</label>
              <textarea className="w-full border rounded px-3 py-2 text-sm resize-none" rows={3} value={description} onChange={(e)=>setDescription(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm mb-1">Time Range *</label>
                <select className="w-full border rounded px-3 py-2 text-sm" value={timeRangeId} onChange={(e)=>setTimeRangeId(e.target.value)} required>
                  <option value="">Select...</option>
                  {timeRanges.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.start_time}-{t.end_time})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Participants *</label>
                <select
                  multiple
                  className="w-full border rounded px-3 py-2 text-sm h-28"
                  value={participantIds}
                  onChange={(e)=>onMultiChange(e, setParticipantIds)}
                  required
                >
                  {participants.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.surname ? ` ${p.surname}` : ""}</option>
                  ))}
                </select>
                <div className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple.</div>
              </div>
              <div>
                <label className="block text-sm mb-1">Units *</label>
                <select
                  multiple
                  className="w-full border rounded px-3 py-2 text-sm h-28"
                  value={unitIds}
                  onChange={(e)=>onMultiChange(e, setUnitIds)}
                  required
                >
                  {units.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <div className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple.</div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <button type="button" className="px-3 py-2 rounded border text-sm">Cancel</button>
              </DialogClose>
              <button type="submit" className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50" disabled={saving || !canSubmit || loading}>
                {saving ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
