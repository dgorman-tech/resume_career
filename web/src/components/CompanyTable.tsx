import { clsx } from "clsx";
import { FlaskConical, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Company } from "../lib/types";

export type RowTest =
  | { kind: "loading" }
  | { kind: "ok"; jobs: number; sample: string | null }
  | { kind: "failed"; error: string };

/** Stable per-row identity, so a test result survives sorting and filtering. */
export const companyKey = (c: Company) => `${c.adapter}:${c.name}`;

export function companyDetail(c: Company): string {
  if ("slug" in c) return c.slug;
  if (c.adapter === "workday") return `${c.tenant}.${c.wd} · ${c.site}`;
  return c.host;
}

type SortCol = "name" | "tier";
interface Sort { col: SortCol; dir: "asc" | "desc" }

interface Props {
  companies: Company[];
  tests: Record<string, RowTest>;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onTest: (index: number) => void;
}

const TH = "px-3 py-2 text-left font-mono text-[11px] font-medium tracking-[0.08em] text-ink-muted shadow-[inset_0_-1px_0_var(--color-hairline)]";

function LastTest({ state }: { state: RowTest | undefined }) {
  // A dash, not the words: twelve rows of "not tested" is noise on the one
  // surface that exists to be skimmed. The reading stays available to a reader.
  if (!state) {
    return <span className="text-ink-muted">—<span className="sr-only">not tested</span></span>;
  }
  if (state.kind === "loading") return <span className="text-ink-muted">testing…</span>;
  if (state.kind === "failed") return <span className="text-red" title={state.error}>fetch failed</span>;
  return (
    <span className="text-teal-deep" title={state.sample ? `e.g. ${state.sample}` : undefined}>
      {state.jobs} jobs
    </span>
  );
}

export function CompanyTable({ companies, tests, onAdd, onEdit, onDelete, onTest }: Props) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>({ col: "tier", dir: "asc" });

  // Carry the config-array index through sorting and filtering: every mutation
  // below writes back into settings.companies by position.
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matched = companies
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => tier == null || c.tier === tier)
      .filter(({ c }) =>
        !needle || `${c.name} ${c.adapter} ${companyDetail(c)}`.toLowerCase().includes(needle));
    const sign = sort.dir === "asc" ? 1 : -1;
    return matched.sort((a, b) => {
      const byName = a.c.name.localeCompare(b.c.name);
      if (sort.col === "name") return sign * byName;
      return sign * (a.c.tier - b.c.tier) || byName;
    });
  }, [companies, q, tier, sort]);

  const tiers = useMemo(() => {
    const counts = new Map<number, number>();
    for (const c of companies) counts.set(c.tier, (counts.get(c.tier) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }, [companies]);

  const chip = (active: boolean) =>
    clsx("flex items-baseline gap-1.5 rounded-full px-3 py-1 text-xs transition",
      active ? "bg-teal-wash font-semibold text-teal-deep" : "bg-sunken text-ink-muted hover:text-ink");
  // The count is data sitting inside a label, so it reads as data.
  const count = (n: number) => <span className="font-mono text-[10px]">{n}</span>;

  const header = (col: SortCol, label: string, w: string) => {
    const active = sort.col === col;
    return (
      <th className={clsx(TH, w)}
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
        <button type="button" className="cursor-pointer select-none tracking-[0.08em] transition hover:text-ink"
          onClick={() => setSort({ col, dir: active && sort.dir === "asc" ? "desc" : "asc" })}>
          {label}{active ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
        </button>
      </th>
    );
  };

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input aria-label="Search companies" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search companies…" className="field w-56 px-3 py-1.5 text-sm" />
        {tiers.length > 1 && (
          <>
            <button aria-pressed={tier == null} className={chip(tier == null)} onClick={() => setTier(null)}>
              All {count(companies.length)}
            </button>
            {tiers.map(([t, n]) => (
              <button key={t} aria-pressed={tier === t} className={chip(tier === t)}
                onClick={() => setTier(tier === t ? null : t)}>
                T{t} {count(n)}
              </button>
            ))}
          </>
        )}
        <div className="grow" />
        <button onClick={onAdd}
          className="flex items-center gap-1 rounded-md border border-hairline px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-sunken">
          <Plus className="size-3.5" aria-hidden="true" /> Add company
        </button>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="bg-surface">
            <tr>
              {header("name", "COMPANY", "w-56")}
              {header("tier", "TIER", "w-20")}
              <th className={clsx(TH, "w-36")}>SOURCE</th>
              <th className={TH}>ENDPOINT</th>
              <th className={clsx(TH, "w-32")}>LAST TEST</th>
              <th className={clsx(TH, "w-24 text-right")}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, index }) => (
              <tr key={companyKey(c)} onClick={() => onEdit(index)}
                className="h-[38px] cursor-pointer border-t border-hairline transition hover:bg-sunken">
                <td className="px-3">
                  {/* The row is the edit target for the mouse; this button is the
                      same target for the keyboard, so no pencil icon is needed. */}
                  <button aria-label={`Edit ${c.name}`} onClick={(e) => { e.stopPropagation(); onEdit(index); }}
                    className="rounded-sm text-left font-semibold">
                    {c.name}
                  </button>
                </td>
                <td className="px-3">
                  <span className="rounded-sm bg-sunken px-1.5 font-mono text-[10px] font-medium text-ink-muted">
                    T{c.tier}
                  </span>
                </td>
                <td className="px-3 font-mono text-xs text-ink-muted">{c.adapter}</td>
                <td className="max-w-0 truncate px-3 font-mono text-xs text-ink-muted"
                  title={companyDetail(c)}>{companyDetail(c)}</td>
                <td className="px-3 font-mono text-xs"><LastTest state={tests[companyKey(c)]} /></td>
                <td className="px-3">
                  <div className="flex justify-end gap-1">
                    <button aria-label={`Test ${c.name}`} onClick={(e) => { e.stopPropagation(); onTest(index); }}
                      className="icon-btn hover:text-teal"><FlaskConical className="size-4" aria-hidden="true" /></button>
                    <button aria-label={`Delete ${c.name}`} onClick={(e) => { e.stopPropagation(); onDelete(index); }}
                      className="icon-btn hover:text-red"><Trash2 className="size-4" aria-hidden="true" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-ink-muted">
                  {companies.length === 0
                    ? "No companies yet. Add one to start watching its careers page."
                    : `No company matches ${q.trim() ? `“${q.trim()}”` : "this tier"}.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
