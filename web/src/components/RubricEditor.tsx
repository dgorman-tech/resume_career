import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getDimensions, putDimensions } from "../lib/api";
import type { DimensionEdit } from "../lib/types";

const MAX_ACTIVE = 8;

export function RubricEditor() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["dimensions"], queryFn: getDimensions });
  const [dims, setDims] = useState<DimensionEdit[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setDims(data.dimensions); }, [data]);

  if (!data) return null;

  const active = dims.filter((d) => !d.archived);
  const archived = dims.filter((d) => d.archived && d.key != null);
  const edit = (i: number, patch: Partial<DimensionEdit>) =>
    setDims(dims.map((d, x) => (x === i ? { ...d, ...patch } : d)));
  const move = (i: number, dir: -1 | 1) => {
    const order = [...active];
    const pos = order.indexOf(dims[i]);
    const swap = order[pos + dir];
    if (!swap) return;
    setDims(dims.map((d) => (d === dims[i] ? swap : d === swap ? dims[i] : d)));
  };
  const add = () =>
    setDims([...dims, { key: null, label: "", description: "", position: dims.length + 1, archived: false }]);
  const archive = (i: number) =>
    dims[i].key === null
      ? setDims(dims.filter((_, x) => x !== i))
      : edit(i, { archived: true });

  const save = async () => {
    setSaving(true);
    try {
      let activePos = 0, archivedPos = 0;
      await putDimensions(dims.map((d) => ({
        ...d,
        position: d.archived ? 900 + archivedPos++ : ++activePos,
      })));
      await qc.invalidateQueries({ queryKey: ["dimensions"] });
      await qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Rubric saved; affected scores are now flagged stale");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const idx = (d: DimensionEdit) => dims.indexOf(d);
  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold">Scoring rubric</h2>
      <p className="mb-2 max-w-prose text-xs text-ink-muted">
        The model scores every job against these dimensions. Editing definitions marks existing
        scores stale until re-scored; ranking weights live on the Board and never require re-scoring.
      </p>
      <div className="space-y-3">
        {active.map((d, i) => (
          <div key={d.key ?? `new-${idx(d)}`} className="panel space-y-2 p-3">
            <div className="flex items-center gap-2">
              <input value={d.label} aria-label={d.key ? "Dimension name" : "New dimension name"}
                onChange={(e) => edit(idx(d), { label: e.target.value })}
                className="field flex-1 px-2 py-1 text-sm font-semibold" maxLength={40} />
              <button onClick={() => move(idx(d), -1)} disabled={i === 0}
                aria-label={`Move ${d.label || "dimension"} up`} className="icon-btn disabled:opacity-40">
                <ArrowUp className="size-4" aria-hidden="true" />
              </button>
              <button onClick={() => move(idx(d), 1)} disabled={i === active.length - 1}
                aria-label={`Move ${d.label || "dimension"} down`} className="icon-btn disabled:opacity-40">
                <ArrowDown className="size-4" aria-hidden="true" />
              </button>
              <button onClick={() => archive(idx(d))}
                className="rounded-md border border-hairline px-2 py-1 text-xs text-ink-muted transition hover:text-ink">
                Archive
              </button>
            </div>
            <textarea value={d.description} rows={2} maxLength={500}
              aria-label={d.key ? "Dimension description" : "New dimension description"}
              onChange={(e) => edit(idx(d), { description: e.target.value })}
              className="field w-full resize-y p-2 text-[13px] leading-relaxed" />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={add} disabled={active.length >= MAX_ACTIVE}
          className="flex items-center gap-1 rounded-md border border-hairline px-3 py-1 text-xs text-ink transition hover:bg-sunken disabled:opacity-50">
          <Plus className="size-3.5" aria-hidden="true" /> Add dimension
        </button>
        {active.length >= MAX_ACTIVE && (
          <span className="text-xs text-ink-muted">8 active dimensions is the maximum — archive one first</span>
        )}
        <button onClick={() => void save()} disabled={saving}
          className="ml-auto rounded-md bg-teal px-5 py-1.5 text-sm font-semibold text-paper transition hover:bg-teal-deep disabled:opacity-50">
          Save rubric
        </button>
      </div>
      {archived.length > 0 && (
        <div className="mt-4 text-xs text-ink-muted">
          <p className="font-mono text-[11px] tracking-[0.08em]">ARCHIVED</p>
          {archived.map((d) => (
            <p key={d.key} className="mt-1 flex items-center gap-2">
              {d.label}
              <button onClick={() => edit(idx(d), { archived: false })}
                disabled={active.length >= MAX_ACTIVE}
                className="text-teal hover:underline disabled:opacity-50">
                Restore {d.label}
              </button>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
