import * as Popover from "@radix-ui/react-popover";
import { useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { putWeights } from "../lib/api";
import type { DimensionsPayload } from "../lib/types";

const DEBOUNCE_MS = 500;
const DEFAULT_DIM_WEIGHT = 10;
const DEFAULT_HOLISTIC = 50;

export function TuneControl({ tune, setTune, onError }: {
  tune: DimensionsPayload | null;
  setTune: (t: DimensionsPayload) => void;
  onError: () => void;
}) {
  const qc = useQueryClient();
  const timer = useRef<number | undefined>(undefined);
  if (!tune) return null;
  const active = tune.dimensions.filter((d) => !d.archived);

  const persist = (next: DimensionsPayload) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const weights = Object.fromEntries(
        next.dimensions.filter((d) => !d.archived).map((d) => [d.key, d.weight]));
      putWeights(weights, next.holistic_weight).then((response) => {
        qc.setQueryData(["dimensions"], response);
      }).catch((e) => {
        toast.error(`Saving weights failed: ${(e as Error).message}`);
        onError();
      });
    }, DEBOUNCE_MS);
  };

  const apply = (next: DimensionsPayload) => { setTune(next); persist(next); };
  const setDim = (key: string, weight: number) =>
    apply({ ...tune, dimensions: tune.dimensions.map((d) => (d.key === key ? { ...d, weight } : d)) });
  const reset = () =>
    apply({ holistic_weight: DEFAULT_HOLISTIC,
            dimensions: tune.dimensions.map((d) => ({ ...d, weight: DEFAULT_DIM_WEIGHT })) });

  const row = (name: string, value: number, onChange: (v: number) => void) => (
    <label key={name} className="flex items-center gap-2 text-xs text-ink">
      <span className="w-28 truncate">{name}</span>
      <input type="range" min={0} max={100} step={5} value={value} aria-label={name}
        onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-teal" />
      <span className="w-7 text-right font-mono text-[11px] text-ink-muted">{value}</span>
    </label>
  );

  return (
    <Popover.Root>
      <Popover.Trigger
        className="flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1 text-xs text-ink-muted transition hover:text-ink">
        <SlidersHorizontal className="size-3.5" aria-hidden="true" /> Tune
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8}
          className="panel z-30 w-80 space-y-2 p-4 shadow-overlay">
          <p className="font-mono text-[11px] font-medium tracking-[0.08em] text-ink-muted">RANKING WEIGHTS</p>
          {row("Model judgment", tune.holistic_weight, (v) => apply({ ...tune, holistic_weight: v }))}
          <div className="border-t border-hairline" />
          {active.map((d) => row(d.label, d.weight, (v) => setDim(d.key, v)))}
          <div className="flex items-center justify-between pt-1">
            <button onClick={reset} className="text-xs text-teal hover:underline">Reset to defaults</button>
            <span className="text-[11px] text-ink-muted">re-ranks live; no re-scoring</span>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
