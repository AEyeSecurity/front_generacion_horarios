"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useI18n } from "@/lib/use-i18n";

const EditTimeRangeDialog = dynamic(() => import("@/components/dialogs/EditTimeRangeDialog"), { ssr: false });

type TimeRange = { id: number; grid: number; name: string; start_time: string; end_time: string };

function norm(t: string) {
  const [h, m] = String(t || "").split(":");
  return `${String(h ?? "00").padStart(2, "0")}:${String(m ?? "00").padStart(2, "0")}`;
}

export default function TimeRangesEditor({ gridId, canEdit }: { gridId: number; canEdit: boolean }) {
  const { t } = useI18n();
  const [items, setItems] = useState<TimeRange[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [nName, setNName] = useState("");
  const [nStart, setNStart] = useState("08:00");
  const [nEnd, setNEnd] = useState("17:00");

  const [editOpen, setEditOpen] = useState(false);
  const [current, setCurrent] = useState<TimeRange | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/time_ranges?grid=${gridId}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`Failed (${r.status})`);
      const data = await r.json();
      setItems(Array.isArray(data) ? data : data.results ?? []);
    } catch (error: unknown) {
      setErr(error instanceof Error && error.message ? error.message : t("time_ranges.error_loading"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [gridId]);

  async function add() {
    const body = {
      grid: gridId,
      name: nName.trim() || "",
      start_time: norm(nStart),
      end_time: norm(nEnd),
    };
    const r = await fetch(`/api/time_ranges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      alert(t("time_ranges.create_failed", { status: r.status }));
      return;
    }
    setNName("");
    setNStart("08:00");
    setNEnd("17:00");
    void load();
  }

  async function remove(id: number) {
    if (!confirm(t("time_ranges.delete_confirm"))) return;
    const r = await fetch(`/api/time_ranges/${id}`, { method: "DELETE" });
    if (r.status !== 204) {
      alert(t("time_ranges.delete_failed", { status: r.status }));
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-4">
      {err && <div className="text-sm text-red-600">{err}</div>}

      {canEdit && (
        <div className="border rounded bg-white p-3 space-y-2">
          <div className="text-sm font-medium">{t("time_ranges.add_new")}</div>
          <div className="grid grid-cols-12 gap-2">
            <input
              className="col-span-6 border rounded px-2 py-1"
              placeholder={t("common.name")}
              value={nName}
              onChange={(e) => setNName(e.target.value)}
            />
            <input className="col-span-3 border rounded px-2 py-1" type="time" value={nStart} onChange={(e) => setNStart(e.target.value)} />
            <input className="col-span-3 border rounded px-2 py-1" type="time" value={nEnd} onChange={(e) => setNEnd(e.target.value)} />
          </div>
          <div className="text-right">
            <button className="px-3 py-1.5 rounded bg-black text-white text-sm" onClick={() => void add()}>{t("common.add")}</button>
          </div>
        </div>
      )}

      <div className="border rounded bg-white overflow-hidden">
        <div className="grid grid-cols-12 text-xs font-medium text-gray-600 px-3 py-2 border-b bg-gray-50">
          <div className="col-span-6">{t("common.name")}</div>
          <div className="col-span-3">{t("common.start")}</div>
          <div className="col-span-3">{t("common.end")}</div>
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-3 text-sm text-gray-500">{t("common.loading")}</div>
          ) : items.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">{t("time_ranges.no_items")}</div>
          ) : (
            items.map((it) => (
              <div className="grid grid-cols-12 items-center px-3 py-2 text-sm" key={it.id}>
                <div className="col-span-6 truncate">{it.name}</div>
                <div className="col-span-3">{norm(it.start_time)}</div>
                <div className="col-span-3 flex items-center justify-end gap-2">
                  <span>{norm(it.end_time)}</span>
                  {canEdit && (
                    <>
                      <button
                        className="w-8 h-8 inline-flex items-center justify-center rounded hover:bg-gray-100"
                        title={t("common.edit")}
                        onClick={() => {
                          setCurrent(it);
                          setEditOpen(true);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        className="w-8 h-8 inline-flex items-center justify-center rounded hover:bg-red-50"
                        title={t("common.delete")}
                        onClick={() => void remove(it.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <EditTimeRangeDialog open={editOpen} onOpenChange={setEditOpen} value={current} onSaved={load} />
    </div>
  );
}
