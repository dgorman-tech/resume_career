import type { Status } from "../lib/types";
import { clsx } from "clsx";

export interface Filters {
  q: string;
  status: "all" | "unreviewed" | Status;
  tier: number | null;
  internalOnly: boolean;
  unscoredOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = { q: "", status: "unreviewed", tier: null, internalOnly: false, unscoredOnly: false };

const STATUS_CHIPS: Array<[Filters["status"], string]> = [
  ["all", "All"], ["unreviewed", "Unreviewed"], ["interested", "Interested"],
  ["applied", "Applied"], ["dismissed", "Dismissed"],
];

export function FilterBar({ filters, setFilters, count, searchRef }: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  count: number;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const chip = (active: boolean) =>
    clsx("rounded-full px-3 py-1 text-xs transition",
      active ? "bg-teal-wash font-semibold text-teal-deep" : "bg-sunken text-ink-muted hover:text-ink");
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input
        ref={searchRef}
        value={filters.q}
        onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        placeholder="Search roles…  ( / )"
        className="field w-64 rounded-full px-4 py-1.5 text-sm"
      />
      {STATUS_CHIPS.map(([s, label]) => (
        <button key={s} className={chip(filters.status === s)} onClick={() => setFilters({ ...filters, status: s })}>
          {label}
        </button>
      ))}
      <button className={chip(filters.internalOnly)} onClick={() => setFilters({ ...filters, internalOnly: !filters.internalOnly })}>
        Internal
      </button>
      <button className={chip(filters.unscoredOnly)} onClick={() => setFilters({ ...filters, unscoredOnly: !filters.unscoredOnly })}>
        Unscored
      </button>
      <span className="ml-auto text-xs text-ink-muted">{count} shown</span>
    </div>
  );
}
