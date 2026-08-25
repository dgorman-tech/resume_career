import { clsx } from "clsx";
import type { Job, Status } from "../lib/types";
import { fmtAge, fmtSalary } from "../lib/format";
import { Badges } from "./Badges";
import { ScoreDial } from "./ScoreDial";
import { StatusPill } from "./StatusPill";

export interface Sort {
  col: "fit" | "tier" | "company" | "salary" | "posted" | "first_seen";
  dir: "asc" | "desc";
}

export const DEFAULT_SORT: Sort = { col: "fit", dir: "desc" };

export function sortJobs(jobs: Job[], sort: Sort): Job[] {
  const val = (j: Job): number | string => {
    switch (sort.col) {
      case "fit": return j.fit ?? -1;
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
  ["fit", "FIT", "w-12"], ["tier", "", "w-[5.5rem]"], ["company", "COMPANY", "w-36"],
  [null, "TITLE", ""], [null, "LOCATION", "w-44"], ["salary", "SALARY", "w-28"],
  ["posted", "POSTED", "w-20"], [null, "STATUS", "w-28"],
];

export function BoardTable({ jobs, selectedKey, onSelect, sort, setSort, onStatus }: {
  jobs: Job[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  sort: Sort;
  setSort: (s: Sort) => void;
  onStatus: (key: string, status: Status) => void;
}) {
  const header = (col: Sort["col"] | null, label: string, w: string) => (
    <th key={label + w}
      className={clsx(
        "px-2 py-2 text-left font-mono text-[11px] font-medium tracking-[0.08em] text-ink-muted shadow-[inset_0_-1px_0_var(--color-hairline)]",
        w, col && "cursor-pointer select-none hover:text-ink")}
      onClick={col ? () => setSort({ col, dir: sort.col === col && sort.dir === "desc" ? "asc" : "desc" }) : undefined}
    >
      {label}{col === sort.col ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );
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
                "h-[38px] cursor-pointer border-t border-hairline transition hover:bg-sunken/60",
                selectedKey === j.key && "bg-teal-wash hover:bg-teal-wash",
                j.status === "dismissed" && "opacity-45",
              )}
            >
              <td className="px-2"><ScoreDial value={j.fit} /></td>
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
