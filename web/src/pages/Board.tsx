import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BoardTable, DEFAULT_SORT, sortJobs, type Sort } from "../components/BoardTable";
import { DEFAULT_FILTERS, FilterBar, type Filters } from "../components/FilterBar";
import { JobDrawer } from "../components/JobDrawer";
import { KeyboardHelp } from "../components/KeyboardHelp";
import { StatsBar } from "../components/StatsBar";
import { useJobs } from "../hooks/useJobs";
import { useKeyboard } from "../hooks/useKeyboard";
import { scoreJob } from "../lib/api";
import type { Job } from "../lib/types";

export function applyFilters(jobs: Job[], f: Filters): Job[] {
  const q = f.q.trim().toLowerCase();
  return jobs.filter((j) => {
    if (q && !`${j.company} ${j.title} ${j.location}`.toLowerCase().includes(q)) return false;
    if (f.status === "unreviewed" && j.status !== "new") return false;
    if (f.status !== "all" && f.status !== "unreviewed" && j.status !== f.status) return false;
    if (f.tier != null && j.tier !== f.tier) return false;
    if (f.internalOnly && !j.is_internal) return false;
    if (f.unscoredOnly && j.fit != null) return false;
    return true;
  });
}

export default function Board() {
  const { jobs, isLoading, patch } = useJobs();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [deepDiveRequested, setDeepDiveRequested] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const visible = useMemo(
    () => sortJobs(applyFilters(jobs ?? [], filters), sort),
    [jobs, filters, sort],
  );
  const selected = visible.find((j) => j.key === selectedKey) ?? (jobs ?? []).find((j) => j.key === selectedKey) ?? null;

  const onScoreNow = (key: string) => {
    toast.promise(scoreJob(key).then(() => qc.invalidateQueries({ queryKey: ["jobs"] })), {
      loading: "Scoring…", success: "Scored", error: (e) => (e as Error).message,
    });
  };

  useKeyboard({
    enabled: true,
    keys: visible.map((j) => j.key),
    selectedKey,
    setSelectedKey,
    drawerOpen,
    setDrawerOpen,
    setStatus: (key, status) => patch(key, { status }),
    toggleStar: (key) => {
      const j = (jobs ?? []).find((x) => x.key === key);
      if (j) patch(key, { starred: !j.starred });
    },
    startDeepDive: () => setDeepDiveRequested(true),
    focusSearch: () => searchRef.current?.focus(),
    toggleHelp: () => setHelpOpen((h) => !h),
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <StatsBar />
      </div>
      <FilterBar filters={filters} setFilters={setFilters} count={visible.length} searchRef={searchRef} />
      {isLoading ? (
        <div className="panel space-y-px overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[38px] animate-pulse bg-sunken" />
          ))}
        </div>
      ) : (
        <BoardTable
          jobs={visible}
          selectedKey={selectedKey}
          onSelect={(k) => { setSelectedKey(k); setDrawerOpen(true); }}
          sort={sort}
          setSort={setSort}
          onStatus={(key, status) => patch(key, { status })}
        />
      )}
      <JobDrawer
        job={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onStatus={(key, s) => patch(key, { status: s })}
        onStar={(key, starred) => patch(key, { starred })}
        onNote={(key, note) => patch(key, { note })}
        onScoreNow={onScoreNow}
        deepDiveRequested={deepDiveRequested}
        onDeepDiveHandled={() => setDeepDiveRequested(false)}
      />
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
