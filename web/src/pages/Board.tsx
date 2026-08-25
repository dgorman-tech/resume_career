import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BoardTable, DEFAULT_SORT, sortJobs, type Sort } from "../components/BoardTable";
import { DEFAULT_FILTERS, FilterBar, type Filters } from "../components/FilterBar";
import { JobDrawer } from "../components/JobDrawer";
import { KeyboardHelp } from "../components/KeyboardHelp";
import { StatsBar } from "../components/StatsBar";
import { TuneControl } from "../components/TuneControl";
import { useJobs } from "../hooks/useJobs";
import { useKeyboard } from "../hooks/useKeyboard";
import { getDimensions, scoreJob } from "../lib/api";
import { scoreMap } from "../lib/score";
import type { DimensionsPayload, Job } from "../lib/types";

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
  const { jobs, isLoading, isError, error, refetch, patch } = useJobs();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [deepDiveRequested, setDeepDiveRequested] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const dimsQuery = useQuery({ queryKey: ["dimensions"], queryFn: getDimensions });
  const [tune, setTune] = useState<DimensionsPayload | null>(null);
  useEffect(() => {
    if (dimsQuery.data && tune == null) setTune(dimsQuery.data);
  }, [dimsQuery.data, tune]);

  const activeDims = useMemo(
    () => (tune?.dimensions ?? []).filter((d) => !d.archived),
    [tune],
  );
  const scores = useMemo(
    () => scoreMap(jobs ?? [], activeDims, tune?.holistic_weight ?? 50),
    [jobs, activeDims, tune],
  );

  const visible = useMemo(
    () => sortJobs(applyFilters(jobs ?? [], filters), sort, scores),
    [jobs, filters, sort, scores],
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
      <div className="mb-3">
        <StatsBar />
      </div>
      <FilterBar filters={filters} setFilters={setFilters} count={visible.length} searchRef={searchRef}
        tune={<TuneControl tune={tune} setTune={setTune}
          onError={() => { setTune(null); void qc.invalidateQueries({ queryKey: ["dimensions"] }); }} />} />
      {isError || dimsQuery.isError ? (
        <div className="panel p-10 text-center">
          <p className="text-sm font-semibold">Couldn't load jobs</p>
          <p className="mx-auto mt-1 max-w-prose text-sm text-ink-muted">
            {error?.message ?? "The Career HQ server didn't respond."} Check that the server is running,
            then try again.
          </p>
          <button onClick={() => { void refetch(); void dimsQuery.refetch(); }}
            className="mt-4 rounded-md bg-teal px-4 py-1.5 text-sm font-semibold text-paper transition hover:bg-teal-deep">
            Retry
          </button>
        </div>
      ) : isLoading || tune == null ? (
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
          scores={scores}
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
