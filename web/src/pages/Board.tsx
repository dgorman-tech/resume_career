import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BoardTable, DEFAULT_SORT, sortJobs, type Sort } from "../components/BoardTable";
import { DismissReasonBar } from "../components/DismissReasonBar";
import { DEFAULT_FILTERS, FilterBar, type Filters } from "../components/FilterBar";
import { JobDrawer } from "../components/JobDrawer";
import { KeyboardHelp } from "../components/KeyboardHelp";
import { StatsBar } from "../components/StatsBar";
import { TuneControl } from "../components/TuneControl";
import { useJobs } from "../hooks/useJobs";
import { useKeyboard } from "../hooks/useKeyboard";
import { extractFacts, getDimensions, scoreJob } from "../lib/api";
import type { DismissReason } from "../lib/dismiss";
import { attentionReason, orderByAttention, todayISO } from "../lib/nextAction";
import { scoreMap } from "../lib/score";
import type { DimensionsPayload, Job, Status } from "../lib/types";

export function applyFilters(jobs: Job[], f: Filters, today: string): Job[] {
  const q = f.q.trim().toLowerCase();
  return jobs.filter((j) => {
    if (q && !`${j.company} ${j.title} ${j.location}`.toLowerCase().includes(q)) return false;
    if (f.tier != null && j.tier !== f.tier) return false;
    if (f.internalOnly && !j.is_internal) return false;
    if (f.unscoredOnly && j.fit != null) return false;
    // Facets read JD facts, so a job whose description was never read cannot
    // satisfy one. Excluding it beats guessing it qualifies.
    if (f.remote != null && j.facts?.remote_policy !== f.remote) return false;
    if (f.maxOfficeDays != null
        && (j.facts?.office_days == null || j.facts.office_days > f.maxOfficeDays)) return false;
    if (f.jdSalaryOnly
        && j.facts?.salary_min_jd == null && j.facts?.salary_max_jd == null) return false;
    // The status chips are a triage lens, and the board opens on 'unreviewed'.
    // Anything actually demanding action today has to come through that lens,
    // or "nothing slips" only holds for people who remember to click All.
    if (attentionReason(j, today)) return true;
    if (f.status === "unreviewed" && j.status !== "new") return false;
    if (f.status !== "all" && f.status !== "unreviewed" && j.status !== f.status) return false;
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
  const [followUpRequested, setFollowUpRequested] = useState(false);
  const [dismissKey, setDismissKey] = useState<string | null>(null);
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

  // one ordering feeds both the table and the keyboard, so j/k always walks the
  // rows in the order they are drawn
  const today = todayISO();
  const visible = useMemo(
    () => orderByAttention(sortJobs(applyFilters(jobs ?? [], filters, today), sort, scores), today),
    [jobs, filters, sort, scores, today],
  );
  const selected = visible.find((j) => j.key === selectedKey) ?? (jobs ?? []).find((j) => j.key === selectedKey) ?? null;

  // Every route to 'dismissed' — the x key, the row pill, the drawer button —
  // goes through the reason picker, so the labelled data does not depend on
  // which control the user happened to reach for.
  const onStatus = (key: string, status: Status) => {
    if (status === "dismissed") setDismissKey(key);
    else patch(key, { status });
  };

  const pickDismissReason = (reason: DismissReason | null) => {
    if (dismissKey) {
      patch(dismissKey, reason ? { status: "dismissed", dismiss_reason: reason }
                               : { status: "dismissed" });
    }
    setDismissKey(null);
  };

  const dismissing = dismissKey
    ? ((jobs ?? []).find((j) => j.key === dismissKey) ?? null)
    : null;

  const onScoreNow = (key: string) => {
    toast.promise(scoreJob(key).then(() => qc.invalidateQueries({ queryKey: ["jobs"] })), {
      loading: "Scoring…", success: "Scored", error: (e) => (e as Error).message,
    });
  };

  const [extractingKey, setExtractingKey] = useState<string | null>(null);
  const onExtractFacts = (key: string) => {
    setExtractingKey(key);
    toast.promise(
      extractFacts(key)
        .then(() => qc.invalidateQueries({ queryKey: ["jobs"] }))
        .finally(() => setExtractingKey(null)),
      { loading: "Reading the description…", success: "Facts extracted",
        error: (e) => (e as Error).message },
    );
  };

  useKeyboard({
    enabled: true,
    keys: visible.map((j) => j.key),
    selectedKey,
    setSelectedKey,
    drawerOpen,
    setDrawerOpen,
    setStatus: onStatus,
    toggleStar: (key) => {
      const j = (jobs ?? []).find((x) => x.key === key);
      if (j) patch(key, { starred: !j.starred });
    },
    startDeepDive: () => setDeepDiveRequested(true),
    setFollowUp: () => setFollowUpRequested(true),
    dismissPending: dismissKey != null,
    startDismiss: (key) => setDismissKey(key),
    pickDismissReason,
    cancelDismiss: () => setDismissKey(null),
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
          onStatus={onStatus}
          scores={scores}
          today={today}
        />
      )}
      <JobDrawer
        job={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onStatus={onStatus}
        onStar={(key, starred) => patch(key, { starred })}
        onNote={(key, note) => patch(key, { note })}
        onNextAction={(key, p) => patch(key, p)}
        onScoreNow={onScoreNow}
        onExtractFacts={onExtractFacts}
        extractingFacts={extractingKey === selected?.key}
        deepDiveRequested={deepDiveRequested}
        onDeepDiveHandled={() => setDeepDiveRequested(false)}
        followUpRequested={followUpRequested}
        onFollowUpHandled={() => setFollowUpRequested(false)}
        score={selected ? (scores.get(selected.key) ?? null) : null}
        dimensions={activeDims}
      />
      <DismissReasonBar
        open={dismissing != null}
        title={dismissing?.title ?? ""}
        company={dismissing?.company ?? ""}
        onPick={pickDismissReason}
        onCancel={() => setDismissKey(null)}
      />
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
