"use client";

import { Loader2, WifiOff, CheckCircle2, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/use-i18n";

export default function SolverProgressDialog({ open, onOpenChange, state, disconnected, elapsedMs, actor, busy, error, onReview, onDismissFailure, onRetry }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  state: "idle" | "running" | "ready" | "failed" | "chosen" | "rejected";
  disconnected: boolean; elapsedMs: number; actor?: string; busy: boolean; error?: string | null;
  onReview: () => void; onDismissFailure: () => void; onRetry: () => void;
}) {
  const { t } = useI18n();
  const running = state === "running";
  const title = disconnected ? t("solver_run.connection_lost") : t(`solver_run.${state}`);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="z-[1800] max-w-lg" data-testid="solver-progress">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{disconnected ? t("solver_run.recovery_hint") : t("solver_run.shared_hint")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-6 text-center" role="status" aria-live="polite">
          {disconnected ? <WifiOff className="h-12 w-12 text-amber-600" /> : running ? <Loader2 className="h-12 w-12 animate-spin text-violet-600" />
            : state === "failed" ? <AlertCircle className="h-12 w-12 text-red-600" /> : <CheckCircle2 className="h-12 w-12 text-violet-600" />}
          {running && <p className="text-2xl font-semibold tabular-nums">{Math.floor(elapsedMs / 1000)} s</p>}
          {actor && <p className="text-sm text-gray-600">{t("solver_run.started_by", { name: actor })}</p>}
          {running && <p className="text-sm text-gray-600">{t("solver_run.running_hint")}</p>}
          {state === "failed" && <p className="text-sm text-red-700">{t("solver_run.failure_hint")}</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={() => onOpenChange(false)}>{t("solver_run.minimize")}</button>
          {disconnected && <button type="button" className="rounded bg-black px-3 py-2 text-sm text-white" onClick={onRetry}>{t("solver_run.retry")}</button>}
          {state === "ready" && !disconnected && <button type="button" className="rounded bg-black px-3 py-2 text-sm text-white" onClick={onReview}>{t("solver_run.review")}</button>}
          {state === "failed" && !disconnected && <button type="button" className="rounded bg-black px-3 py-2 text-sm text-white" disabled={busy} onClick={onDismissFailure}>{t("solver_run.dismiss_failure")}</button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
