import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { getHealth, getScoringStatus, rescoreStale, scoreUnscored } from "../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";

export function GearDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: health, refetch } = useQuery({ queryKey: ["health"], queryFn: getHealth, enabled: open });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmStale, setConfirmStale] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const stale = health?.stale_shortlisted ?? 0;

  const startBackfill = async (
    run: () => Promise<{ started: boolean; total: number }> = () => scoreUnscored(50),
    emptyMessage = "Nothing unscored",
  ) => {
    try {
      const { started, total } = await run();
      if (!started) { toast.info(emptyMessage); return; }
      setProgress({ done: 0, total });
      const poll = async () => {
        try {
          const s = await getScoringStatus();
          setProgress({ done: s.done, total: s.total });
          if (s.running) {
            timer.current = window.setTimeout(() => void poll(), 2000);
          } else {
            setProgress(null);
            toast.success(`Backfill done: ${s.done - s.errors} scored, ${s.errors} failed`);
            await qc.invalidateQueries({ queryKey: ["jobs"] });
            await qc.invalidateQueries({ queryKey: ["stats"] });
            await refetch();
          }
        } catch (e) {
          setProgress(null);
          toast.error((e as Error).message);
        }
      };
      void poll();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const row = (label: string, value: React.ReactNode) => (
    <tr><td className="py-1 pr-4 text-ink-muted">{label}</td><td className="font-mono text-xs">{value}</td></tr>
  );

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) { window.clearTimeout(timer.current); setProgress(null); onClose(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-scrim fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-96 -translate-x-1/2 -translate-y-1/2">
          <div className="panel dialog-panel p-6 text-sm shadow-overlay">
            <div className="mb-3 flex items-center justify-between gap-4">
              <Dialog.Title className="text-[15px] font-semibold">Health &amp; scoring</Dialog.Title>
              <Dialog.Close aria-label="Close" className="icon-btn -mr-2 shrink-0">
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </div>
            {health && (
              <table className="w-full">
                <tbody>
                  {row("Gemini key", health.key_present ? "present ✓" : <span className="text-red">MISSING (set GEMINI_API_KEY)</span>)}
                  {row("Batch model", health.batch_model)}
                  {row("Deep-dive model", health.deep_dive_model)}
                  {row("Batch scoring", health.batch_scoring ? "on (daily run)" : "off")}
                  {row("Last watcher run", health.last_run ? `${health.last_run.ts} · ${health.last_run.company} · ${health.last_run.status}` : "—")}
                  {row("Unscored jobs", String(health.unscored))}
                  {row("Stale shortlisted", String(health.stale_shortlisted))}
                </tbody>
              </table>
            )}
            <button
              onClick={() => void startBackfill()}
              disabled={!!progress || !health?.key_present}
              className="mt-4 w-full rounded-md bg-teal py-1.5 font-semibold text-paper transition hover:bg-teal-deep disabled:opacity-50"
            >
              {progress ? `Scoring… ${progress.done}/${progress.total}` : `Score all unscored (${health?.unscored ?? 0})`}
            </button>
            {stale > 0 && (
              <button
                onClick={() => setConfirmStale(true)}
                disabled={!!progress || !health?.key_present}
                className="mt-2 w-full rounded-md border border-hairline py-1.5 font-semibold text-ink transition hover:bg-sunken disabled:opacity-50"
              >
                Re-score stale shortlisted ({stale})
              </button>
            )}
            <p className="mt-2 text-[11px] text-ink-muted">
              Models are set in the Settings tab, under Advanced.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
      <ConfirmDialog
        open={confirmStale}
        title="Re-score stale shortlisted roles?"
        body={`This sends your profile, rubric, and each job's description to Gemini — ${stale} role${stale === 1 ? "" : "s"} you marked interested, applied, or starred whose scores predate your current profile. Nothing else on the board is touched.`}
        confirmLabel={`Re-score ${stale}`}
        onConfirm={() => void startBackfill(() => rescoreStale(stale), "Nothing stale to re-score")}
        onClose={() => setConfirmStale(false)}
      />
    </Dialog.Root>
  );
}
