import { clsx } from "clsx";
import type { Job, Status } from "../lib/types";
import { fmtAge, fmtSalary } from "../lib/format";
import { Badges } from "./Badges";
import { ScoreDial } from "./ScoreDial";
import { StatusPill } from "./StatusPill";

export interface Sort {
  col: "score" | "tier" | "company" | "salary" | "posted" | "first_seen";
  dir: "asc" | "desc";
}

export const DEFAULT_SORT: Sort = { col: "score", dir: "desc" };

export function sortJobs(jobs: Job[], sort: Sort, scores: Map<string, number | null>): Job[] {
  const val = (j: Job): number | string => {
    switch (sort.col) {
      case "score": return scores.get(j.key) ?? -1;
      case "tier": return j.tier;
      case "company": return j.company.toLowerCase();
      case "salary": return j.salary_max ?? j.salary_min ?? -1;
      case "posted": return j.posted_at || "";
      case "first_seen": return j.first_seen || "";
    }
  };
  return [...jobs].sort((a, b) => {
    const av = val(a), bv = val(b);
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    const primary = sort.dir === "asc" ? cmp : -cmp;
    return primary !== 0 ? primary : a.tier - b.tier;
  });
}

const COLS: Array<[Sort["col"] | null, string, string]> = [
  ["score", "SCORE", "w-12"], ["tier", "TIER", "w-24"], ["company", "COMPANY", "w-36"],
  [null, "TITLE", "w-96"], [null, "LOCATION", "w-44"], ["salary", "SALARY", "w-28"],
  ["posted", "POSTED", "w-20"], [null, "STATUS", "w-28"],
];

export function BoardTable({ jobs, selectedKey, onSelect, sort, setSort, onStatus, scores }: {
  jobs: Job[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  sort: Sort;
  setSort: (s: Sort) => void;
  onStatus: (key: string, status: Status) => void;
  scores: Map<string, number | null>;
}) {
  const header = (col: Sort["col"] | null, label: string, w: string) => {
    const active = col != null && col === sort.col;
    return (
      <th key={label + w}
        aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : undefined}
        className={clsx(
          "px-2 py-2 text-left font-mono text-[11px] font-medium tracking-[0.08em] text-ink-muted shadow-[inset_0_-1px_0_var(--color-hairline)]",
          w)}
      >
        {col ? (
          <button
            type="button"
            onClick={() => setSort({ col, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
            className="cursor-pointer select-none rounded-sm tracking-[0.08em] transition hover:text-ink"
          >
            {label}{active ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
          </button>
        ) : label}
      </th>
    );
  };
  return (
    <div className="panel overflow-auto">
      <table className="w-full table-fixed border-collapse text-[13px]">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>{COLS.map(([c, l, w]) => header(c, l, w))}</tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr
              key={j.key}
              data-key={j.key}
              onClick={() => onSelect(j.key)}
              className={clsx(
                "h-[38px] cursor-pointer border-t border-hairline transition hover:bg-sunken",
                selectedKey === j.key && "bg-teal-wash hover:bg-teal-wash",
                // Dismissed rows recede via a muted ink, not opacity: fading the
                // whole row drops real content below the 4.5:1 contrast floor.
                j.status === "dismissed" && "[&>td]:text-ink-muted [&>td]:font-normal",
              )}
            >
              <td className="px-2"><ScoreDial value={scores.get(j.key) ?? null} /></td>
              <td className="overflow-hidden px-2"><Badges job={j} /></td>
              <td className="truncate px-2 font-semibold">{j.company}</td>
              <td className="truncate px-2 text-ink">{j.title}</td>
              <td className="truncate px-2 text-ink-muted">{j.location}</td>
              <td className="px-2 font-mono text-xs text-ink">
                {fmtSalary(j.salary_min, j.salary_max)}
              </td>
              <td className="px-2 font-mono text-xs text-ink-muted">{fmtAge(j.first_seen)}</td>
              <td className="px-2"><StatusPill status={j.status} onChange={(s) => onStatus(j.key, s)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {jobs.length === 0 && (
        <p className="p-10 text-center text-sm text-ink-muted">
          Nothing matches these filters. Clear a filter, or wait for the next watcher run.
        </p>
      )}
    </div>
  );
}
