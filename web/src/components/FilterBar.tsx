import type { RemotePolicy, Status } from "../lib/types";
import { clsx } from "clsx";

export interface Filters {
  q: string;
  status: "all" | "unreviewed" | Status;
  tier: number | null;
  internalOnly: boolean;
  unscoredOnly: boolean;
  /** JD-fact facets. Each narrows to jobs whose description was actually read. */
  remote: RemotePolicy | null;
  maxOfficeDays: number | null;
  jdSalaryOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  q: "", status: "unreviewed", tier: null, internalOnly: false, unscoredOnly: false,
  remote: null, maxOfficeDays: null, jdSalaryOnly: false,
};

const REMOTE_OPTIONS: Array<[RemotePolicy | "", string]> = [
  ["", "Any location"], ["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "Onsite"],
];

const STATUS_CHIPS: Array<[Filters["status"], string]> = [
  ["all", "All"], ["unreviewed", "Unreviewed"], ["interested", "Interested"],
  ["applied", "Applied"], ["dismissed", "Dismissed"],
];

export function FilterBar({ filters, setFilters, count, searchRef, tune }: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  count: number;
  searchRef: React.RefObject<HTMLInputElement | null>;
  tune?: React.ReactNode;
}) {
  const chip = (active: boolean) =>
    clsx("rounded-full px-3 py-1 text-xs transition",
      active ? "bg-teal-wash font-semibold text-teal-deep" : "bg-sunken text-ink-muted hover:text-ink");
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input
        ref={searchRef}
        aria-label="Search roles"
        value={filters.q}
        onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        placeholder="Search roles…  ( / )"
        className="field w-64 px-3 py-1.5 text-sm"
      />
      {STATUS_CHIPS.map(([s, label]) => (
        <button key={s} aria-pressed={filters.status === s} className={chip(filters.status === s)}
          onClick={() => setFilters({ ...filters, status: s })}>
          {label}
        </button>
      ))}
      <button aria-pressed={filters.internalOnly} className={chip(filters.internalOnly)}
        onClick={() => setFilters({ ...filters, internalOnly: !filters.internalOnly })}>
        Internal
      </button>
      <button aria-pressed={filters.unscoredOnly} className={chip(filters.unscoredOnly)}
        onClick={() => setFilters({ ...filters, unscoredOnly: !filters.unscoredOnly })}>
        Unscored
      </button>

      <select
        aria-label="Location"
        value={filters.remote ?? ""}
        onChange={(e) => setFilters({ ...filters, remote: (e.target.value || null) as Filters["remote"] })}
        className="field px-2 py-1 text-xs"
      >
        {REMOTE_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>

      <select
        aria-label="Office days"
        value={filters.maxOfficeDays ?? ""}
        onChange={(e) => setFilters({
          ...filters,
          // "" means no ceiling; 0 is a real ceiling and must survive the cast
          maxOfficeDays: e.target.value === "" ? null : Number(e.target.value),
        })}
        className="field px-2 py-1 text-xs"
      >
        <option value="">Any office days</option>
        {[0, 1, 2, 3, 4].map((n) => (
          <option key={n} value={n}>{n === 0 ? "No office days" : `${n} or fewer`}</option>
        ))}
      </select>

      <button aria-pressed={filters.jdSalaryOnly} className={chip(filters.jdSalaryOnly)}
        onClick={() => setFilters({ ...filters, jdSalaryOnly: !filters.jdSalaryOnly })}>
        JD salary
      </button>
      {tune}
      <span aria-live="polite" className="ml-auto text-xs text-ink-muted">{count} shown</span>
    </div>
  );
}
