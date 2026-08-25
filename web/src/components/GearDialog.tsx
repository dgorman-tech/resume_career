import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { getHealth, getScoringStatus, scoreUnscored } from "../lib/api";

export function GearDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: health, refetch } = useQuery({ queryKey: ["health"], queryFn: getHealth, enabled: open });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const startBackfill = async () => {
    try {
      const { started, total } = await scoreUnscored(50);
      if (!started) { toast.info("Nothing unscored"); return; }
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
    <tr><td className="py-1 pr-4 text-ink-muted">{label}</td><td className="font-[family-name:var(--font-mono)] text-xs">{value}</td></tr>
  );

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) { window.clearTimeout(timer.current); setProgress(null); onClose(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="glass fixed top-1/2 left-1/2 z-50 w-96 -translate-x-1/2 -translate-y-1/2 rounded-xl !bg-night-2/95 p-5 text-sm">
          <Dialog.Title className="grad-text mb-3 font-[family-name:var(--font-display)] font-bold">Settings & health</Dialog.Title>
          {health && (
            <table className="w-full">
              <tbody>
                {row("Gemini key", health.key_present ? "present ✓" : "MISSING — set GEMINI_API_KEY")}
                {row("Batch model", health.batch_model)}
                {row("Deep-dive model", health.deep_dive_model)}
                {row("Batch scoring", health.batch_scoring ? "on (daily run)" : "off")}
                {row("Last watcher run", health.last_run ? `${health.last_run.ts} · ${health.last_run.company} · ${health.last_run.status}` : "—")}
                {row("Unscored jobs", String(health.unscored))}
              </tbody>
            </table>
          )}
          <button
            onClick={() => void startBackfill()}
            disabled={!!progress || !health?.key_present}
            className="grad-bg mt-4 w-full rounded-full py-1.5 font-bold text-white disabled:opacity-50"
          >
            {progress ? `Scoring… ${progress.done}/${progress.total}` : `Score all unscored (${health?.unscored ?? 0})`}
          </button>
          <p className="mt-2 text-[11px] text-ink-muted">Models are set in watcher/config.json → "app".</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
