import { clsx } from "clsx";
import type { Job, Status } from "../lib/types";
import { fmtAge, fmtSalary } from "../lib/format";
import { attentionReason, partitionAttention, todayISO } from "../lib/nextAction";
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

export interface Col {
  key: Sort["col"] | null;
  label: string;
  w: string;
  /** dropped below `md`: at 390px the table would otherwise push the columns
   *  that actually drive a decision off the side of the screen */
  hideNarrow?: boolean;
}

export const COLS: Col[] = [
  { key: "score", label: "SCORE", w: "w-10 md:w-12" },
  { key: "tier", label: "TIER", w: "w-24", hideNarrow: true },
  { key: "company", label: "COMPANY", w: "w-28 md:w-36" },
  { key: null, label: "TITLE", w: "w-auto md:w-96" },
  { key: null, label: "LOCATION", w: "w-44", hideNarrow: true },
  { key: "salary", label: "SALARY", w: "w-28", hideNarrow: true },
  { key: "posted", label: "POSTED", w: "w-20", hideNarrow: true },
  { key: null, label: "STATUS", w: "w-24 md:w-28" },
];

const NARROW_HIDDEN = "hidden md:table-cell";

const CHIP: Record<string, { label: string; cls: string }> = {
  closed: { label: "closed", cls: "text-red" },
  overdue: { label: "overdue", cls: "text-red" },
  today: { label: "due today", cls: "text-amber" },
};

function AttentionChip({ job, today }: { job: Job; today: string }) {
  const reason = attentionReason(job, today);
  if (!reason) return null;
  const { label, cls } = CHIP[reason];
  return (
    <span className={clsx("ml-2 shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase", cls)}>
      {label}
    </span>
  );
}

export function BoardTable({ jobs, selectedKey, onSelect, sort, setSort, onStatus, scores,
                             today = todayISO() }: {
  jobs: Job[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  sort: Sort;
  setSort: (s: Sort) => void;
  onStatus: (key: string, status: Status) => void;
  scores: Map<string, number | null>;
  today?: string;
}) {
  const { attention, rest } = partitionAttention(jobs, today);
  const header = ({ key: col, label, w, hideNarrow }: Col) => {
    const active = col != null && col === sort.col;
    return (
      <th key={label}
        aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : undefined}
        className={clsx(
          "px-2 py-2 text-left font-mono text-[11px] font-medium tracking-[0.08em] text-ink-muted shadow-[inset_0_-1px_0_var(--color-hairline)]",
          w, hideNarrow && NARROW_HIDDEN)}
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
  const row = (j: Job) => (
    <tr
      key={j.key}
      data-key={j.key}
      // programmatically focusable only: keyboard nav is j/k, so rows must never
      // become eight tab stops between the filter bar and the drawer
      tabIndex={-1}
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
      <td className={clsx("overflow-hidden px-2", NARROW_HIDDEN)}><Badges job={j} /></td>
      <td className="truncate px-2 font-semibold">{j.company}</td>
      <td className="px-2 text-ink">
        <span className="flex items-baseline">
          <span className="truncate">{j.title}</span>
          <AttentionChip job={j} today={today} />
        </span>
      </td>
      <td className={clsx("truncate px-2 text-ink-muted", NARROW_HIDDEN)}>{j.location}</td>
      <td className={clsx("px-2 font-mono text-xs text-ink", NARROW_HIDDEN)}>
        {fmtSalary(j.salary_min, j.salary_max)}
      </td>
      <td className={clsx("px-2 font-mono text-xs text-ink-muted", NARROW_HIDDEN)}>{fmtAge(j.first_seen)}</td>
      <td className="px-2"><StatusPill status={j.status} onChange={(s) => onStatus(j.key, s)} /></td>
    </tr>
  );

  return (
    <div className="panel overflow-auto">
      <table className="w-full table-fixed border-collapse text-[13px]">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>{COLS.map(header)}</tr>
        </thead>
        <tbody>
          {attention.length > 0 && (
            <tr>
              <th scope="colgroup" colSpan={COLS.length}
                className="border-t border-hairline bg-sunken px-2 py-1.5 text-left font-mono text-[11px] tracking-[0.08em] text-amber">
                NEEDS ATTENTION ({attention.length})
              </th>
            </tr>
          )}
          {attention.map(row)}
          {rest.map(row)}
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
