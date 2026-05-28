"use client";

import * as React from "react";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import AnimatedList from "@/components/navigation/AnimatedList";
import { Trash2, Pencil, Check, X } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";
const CATEGORY_VALUES_UPDATED_EVENT = "shift:category-values-updated";

export default function AddCategoryDialog({
  gridId,
  open,
  onOpenChange,
  onCreated,
  parents,
}: {
  gridId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
  parents?: { id: number; name: string }[];
}) {
  const { t } = useI18n();
  const [name, setName] = React.useState("");
  const [parent, setParent] = React.useState<number | "">("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [createdId, setCreatedId] = React.useState<number | null>(null);
  const [values, setValues] = React.useState<{ id: number; name: string; category: number }[]>([]);
  const [newValue, setNewValue] = React.useState("");
  const [addingValue, setAddingValue] = React.useState(false);
  const [updatingValueId, setUpdatingValueId] = React.useState<number | null>(null);
  const [editingValueId, setEditingValueId] = React.useState<number | null>(null);
  const [editingValueName, setEditingValueName] = React.useState("");
  const [closing, setClosing] = React.useState(false);
  const [onboardingCategoryStepActive, setOnboardingCategoryStepActive] = React.useState(false);
  const hasParentOptions = (parents ?? []).length > 0;
  const onboardingStepKey = React.useMemo(() => `onboarding-step-grid-${gridId}`, [gridId]);
  const onboardingDoneKey = React.useMemo(() => `onboarding-done-grid-${gridId}`, [gridId]);
  const lockValueCreationCancel = Boolean(createdId) && onboardingCategoryStepActive;

  React.useEffect(() => {
    if (!hasParentOptions) setParent("");
  }, [hasParentOptions]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/categories/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grid: gridId,
          name: name.trim(),
          parent: parent === "" ? null : Number(parent),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j === "object" ? JSON.stringify(j) : String(j));
      }
      const created = await res.json().catch(() => ({}));
      const id = Number(created?.id);
      if (!id) throw new Error(t("add_category.failed_resolve_id"));
      setCreatedId(id);
      setValues([]);
      setNewValue("");
    } catch (e: any) {
      setErr(e.message || t("add_category.failed_create"));
    } finally {
      setSaving(false);
    }
  }

  async function loadValues(catId: number) {
    try {
      const res = await fetch(`/api/category_values?category=${catId}`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 404) {
          setValues([]);
          return;
        }
        throw new Error(`Failed (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      const items = Array.isArray(data) ? data : data.results ?? [];
      setValues(items.filter((v: any) => Number(v.category) === Number(catId)));
    } catch (e: any) {
      setErr(e?.message || t("add_category.failed_load_values"));
    }
  }

  React.useEffect(() => {
    if (createdId) loadValues(createdId);
  }, [createdId]);

  React.useEffect(() => {
    if (!open) {
      setOnboardingCategoryStepActive(false);
      return;
    }
    if (typeof window === "undefined") return;
    const sync = () => {
      const active =
        window.localStorage.getItem(onboardingDoneKey) !== "1" &&
        window.localStorage.getItem(onboardingStepKey) === "2";
      setOnboardingCategoryStepActive(active);
    };
    sync();
    window.addEventListener("storage", sync);
    const intervalId = window.setInterval(sync, 300);
    return () => {
      window.removeEventListener("storage", sync);
      window.clearInterval(intervalId);
    };
  }, [onboardingDoneKey, onboardingStepKey, open]);

  async function addValue(e: React.FormEvent) {
    e.preventDefault();
    if (!createdId || !newValue.trim()) return;
    setAddingValue(true);
    setErr(null);
    try {
      const res = await fetch(`/api/category_values`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: createdId, name: newValue.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewValue("");
      await loadValues(createdId);
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CATEGORY_VALUES_UPDATED_EVENT));
    } catch (e: any) {
      setErr(e?.message || t("add_category.failed_add_value"));
    } finally {
      setAddingValue(false);
    }
  }

  async function deleteCategory(catId: number) {
    const res = await fetch(`/api/categories/${catId}`, { method: "DELETE" });
    if (res.status === 404) return;
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Failed (${res.status})`);
    }
  }

  async function removeValue(id: number) {
    if (!window.confirm(t("category_dialog.confirm_delete_value"))) return;
    const res = await fetch(`/api/category_values/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      setErr(t("category_dialog.failed_delete_value", { status: res.status, details: txt }));
      return;
    }
    if (createdId) await loadValues(createdId);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CATEGORY_VALUES_UPDATED_EVENT));
  }

  async function renameValue(id: number, nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    setUpdatingValueId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/category_values/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed (${res.status})`);
      }
      setEditingValueId(null);
      setEditingValueName("");
      if (createdId) await loadValues(createdId);
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CATEGORY_VALUES_UPDATED_EVENT));
    } catch (error: any) {
      setErr(error?.message || t("category_dialog.failed_update_value"));
    } finally {
      setUpdatingValueId(null);
    }
  }

  function resetDialogState() {
    setName("");
    setParent("");
    setCreatedId(null);
    setValues([]);
    setNewValue("");
    setErr(null);
  }

  async function finishValueStep() {
    if (closing || !createdId || values.length === 0) return;
    resetDialogState();
    onCreated?.();
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CATEGORY_VALUES_UPDATED_EVENT));
    onOpenChange(false);
  }

  async function cancelDialog() {
    if (closing) return;
    const hadCreatedCategory = createdId != null;
    if (createdId != null) {
      try {
        setClosing(true);
        await deleteCategory(createdId);
      } catch (e: any) {
        setErr(e?.message || t("add_category.failed_delete_empty"));
        return;
      } finally {
        setClosing(false);
      }
    }
    resetDialogState();
    if (hadCreatedCategory) onCreated?.();
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CATEGORY_VALUES_UPDATED_EVENT));
    onOpenChange(false);
  }

  async function handleOpenChange(v: boolean) {
    if (v) {
      onOpenChange(true);
      return;
    }
    if (lockValueCreationCancel) return;
    await cancelDialog();
  }

  const latestValueId = React.useMemo(() => {
    if (values.length === 0) return null;
    return Math.max(...values.map((value) => Number(value.id) || 0));
  }, [values]);
  const valueListItems = React.useMemo(() => values.map((value) => String(value.id)), [values]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 bg-black/50 z-[180]" />
        <DialogContent
          className={`z-[181] sm:max-w-[720px] ${createdId ? "sm:h-[460px]" : ""}`}
          showCloseButton={!lockValueCreationCancel}
          data-onboarding-target="category-dialog"
        >
          <DialogHeader>
            <DialogTitle>{createdId ? t("add_category.add_category_values") : t("add_category.add_category")}</DialogTitle>
          </DialogHeader>

          {!createdId ? (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">{t("add_category.name_required")}</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              {hasParentOptions ? (
                <div>
                  <label className="block text-sm mb-1">{t("add_category.parent_optional")}</label>
                  <select
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={parent === "" ? "" : String(parent)}
                    onChange={(e) => setParent(e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    <option value="">{t("add_category.no_parent")}</option>
                    {(parents ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {err && <div className="text-sm text-red-600 whitespace-pre-wrap">{err}</div>}

              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <button type="button" className="px-3 py-2 rounded border text-sm">
                    {t("common.cancel")}
                  </button>
                </DialogClose>
                <button
                  type="submit"
                  className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? t("add_category.adding") : t("common.next")}
                </button>
              </DialogFooter>
            </form>
          ) : (
            <div className="flex h-full min-h-[320px] flex-col gap-4">
              <div className="text-sm text-gray-600">{t("add_category.add_one_value_required")}</div>

              <form onSubmit={addValue} className="flex items-center gap-2" data-onboarding-target="category-value-add-row">
                <input
                  data-onboarding-target="category-value-name-input"
                  className="flex-1 border rounded px-3 py-2 text-sm"
                  placeholder={t("add_category.new_value_name")}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
                  disabled={addingValue || !newValue.trim()}
                >
                  {t("common.add")}
                </button>
              </form>

              {err && <div className="text-sm text-red-600 whitespace-pre-wrap">{err}</div>}

              <div className="flex-1 rounded border bg-white p-2">
                {addingValue && values.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500">{t("category_dialog.loading")}</div>
                ) : values.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500">{t("add_category.no_values_yet")}</div>
                ) : (
                  <AnimatedList
                    className="w-full"
                    items={valueListItems}
                    itemKey={(item) => item}
                    renderItem={(item, index) => {
                      const valueId = Number(values[index]?.id);
                      const valueName = values[index]?.name ?? item;
                      const isEditing = Number.isFinite(valueId) && editingValueId === valueId;
                      const isBusy = Number.isFinite(valueId) && updatingValueId === valueId;
                      return (
                        <div
                          className="flex h-12 items-center justify-between rounded border border-gray-200 bg-white px-3 text-sm text-gray-900"
                          data-onboarding-target={
                            Number(values[index]?.id) === latestValueId ? "category-value-latest-row" : undefined
                          }
                        >
                          {isEditing ? (
                            <input
                              className="mr-2 h-8 flex-1 rounded border px-2 text-sm"
                              value={editingValueName}
                              onChange={(event) => setEditingValueName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  if (Number.isFinite(valueId)) void renameValue(valueId, editingValueName);
                                } else if (event.key === "Escape") {
                                  event.preventDefault();
                                  setEditingValueId(null);
                                  setEditingValueName("");
                                }
                              }}
                              autoFocus
                            />
                          ) : (
                            <span className="truncate pr-3">{valueName}</span>
                          )}
                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                                  disabled={isBusy}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (Number.isFinite(valueId)) void renameValue(valueId, editingValueName);
                                  }}
                                  title={t("common.save")}
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-600 hover:bg-gray-100"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setEditingValueId(null);
                                    setEditingValueName("");
                                  }}
                                  title={t("common.cancel")}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-600 hover:bg-gray-100"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (!Number.isFinite(valueId)) return;
                                  setEditingValueId(valueId);
                                  setEditingValueName(valueName);
                                }}
                                title={t("common.edit")}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded text-red-600 hover:bg-red-50"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!Number.isFinite(valueId)) return;
                                void removeValue(valueId);
                              }}
                              title={t("category_dialog.delete_value")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    }}
                    showGradients={false}
                    enableArrowNavigation={false}
                    selectOnHover={false}
                    displayScrollbar
                    maxVisibleItems={3}
                    itemHeightPx={48}
                    itemGapPx={8}
                    listPaddingPx={0}
                  />
                )}
              </div>

              <DialogFooter className="mt-auto gap-2">
                {!lockValueCreationCancel ? (
                  <button type="button" className="px-3 py-2 rounded border text-sm" disabled={closing} onClick={() => void cancelDialog()}>
                    {t("common.cancel")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
                  disabled={values.length === 0 || closing}
                  onClick={() => void finishValueStep()}
                >
                  {t("common.finish")}
                </button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
