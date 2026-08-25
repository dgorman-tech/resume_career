import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Star, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import type { Job, Status } from "../lib/types";
import { fmtSalary } from "../lib/format";
import { Badges } from "./Badges";
import { DeepDivePanel } from "./DeepDivePanel";
import { ScoreDial } from "./ScoreDial";

const SUB_LABELS: Array<[keyof NonNullable<Job["subscores"]>, string]> = [
  ["comp", "COMP"], ["player_coach", "P-COACH"], ["cost_center", "COST-CTR"],
  ["flex", "FLEX"], ["level", "LEVEL"],
];

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <h3 className="text-[10px] font-bold tracking-widest text-ink-muted">{label}</h3>
      <p className="mt-0.5 text-[13px] leading-relaxed text-ink/90">{children}</p>
    </div>
  );
}

export function JobDrawer({ job, open, onClose, onStatus, onStar, onNote, onScoreNow, deepDiveRequested, onDeepDiveHandled }: {
  job: Job | null;
  open: boolean;
  onClose: () => void;
  onStatus: (key: string, s: Status) => void;
  onStar: (key: string, starred: boolean) => void;
  onNote: (key: string, note: string) => void;
  onScoreNow: (key: string) => void;
  deepDiveRequested: boolean;
  onDeepDiveHandled: () => void;
}) {
  const [note, setNote] = useState("");
  const noteTimer = useRef<number | undefined>(undefined);
  // Tracks the most recently typed value not yet flushed to the server, keyed
  // to the job it belongs to, so a fast job switch (j/k) or drawer/component
  // unmount never silently drops an in-flight edit.
  const pendingRef = useRef<{ key: string; value: string } | null>(null);

  useEffect(() => {
    setNote(job?.note ?? "");
    return () => {
      if (pendingRef.current) {
        window.clearTimeout(noteTimer.current);
        onNote(pendingRef.current.key, pendingRef.current.value);
        pendingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.key]);

  const onNoteChange = (v: string) => {
    setNote(v);
    window.clearTimeout(noteTimer.current);
    if (job) {
      pendingRef.current = { key: job.key, value: v };
      noteTimer.current = window.setTimeout(() => {
        onNote(job.key, v);
        pendingRef.current = null;
      }, 600);
    }
  };

  const action = (label: string, cls: string, fn: () => void) => (
    <button onClick={fn} className={clsx("rounded-full border px-3 py-1 text-xs font-semibold transition", cls)}>
      {label}
    </button>
  );

  return (
    <AnimatePresence>
      {open && job && (
        <>
          <motion.div
            className="fixed inset-0 z-30 bg-black/40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            key={job.key}
            className="glass fixed top-0 right-0 z-40 flex h-full w-[480px] max-w-[90vw] flex-col overflow-y-auto !bg-night-2/90 p-5"
            initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-lg leading-tight font-bold">{job.title}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <span className="font-semibold text-ink">{job.company}</span>
                  <Badges job={job} />
                  <span>{job.location}</span>
                  <span className="font-[family-name:var(--font-mono)] text-teal">{fmtSalary(job.salary_min, job.salary_max)}</span>
                  <a href={job.url} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1 text-teal hover:underline">
                    posting <ExternalLink className="size-3" />
                  </a>
                </p>
              </div>
              <button onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink"><X className="size-5" /></button>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <ScoreDial value={job.fit} size={44} />
              {job.fit == null ? (
                <button onClick={() => onScoreNow(job.key)}
                  className="glass rounded-full px-3 py-1 text-xs font-semibold text-teal hover:border-teal/50">
                  Score now
                </button>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {job.subscores && SUB_LABELS.map(([k, label]) => (
                    <span key={k} className="rounded bg-white/10 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-bold text-ink-muted">
                      {label} {job.subscores![k]}
                    </span>
                  ))}
                  {job.stale && <span className="text-[10px] text-amber">profile changed since scoring</span>}
                </div>
              )}
            </div>

            {job.why && <Block label="WHY">{job.why}</Block>}
            {job.gaps && <Block label="GAPS">{job.gaps}</Block>}
            {job.angle && <Block label="ANGLE">{job.angle}</Block>}

            <DeepDivePanel jobKey={job.key} hasExisting={job.has_deep_dive}
              autoStart={deepDiveRequested} onStarted={onDeepDiveHandled} />

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {action("★ Interested", job.status === "interested" ? "grad-bg border-transparent text-white" : "border-teal/50 text-teal", () => onStatus(job.key, "interested"))}
              {action("✕ Dismiss", "border-white/20 text-ink-muted", () => onStatus(job.key, "dismissed"))}
              {action("✓ Applied", job.status === "applied" ? "grad-bg border-transparent text-white" : "border-violet/50 text-violet", () => onStatus(job.key, "applied"))}
              <button onClick={() => onStar(job.key, !job.starred)} aria-label="Star"
                className={clsx("ml-auto", job.starred ? "text-amber" : "text-ink-muted hover:text-amber")}>
                <Star className="size-5" fill={job.starred ? "currentColor" : "none"} />
              </button>
            </div>

            <textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Add note… (autosaves)"
              rows={3}
              className="glass mt-4 w-full resize-y rounded-lg p-3 text-[13px] text-ink outline-none placeholder:text-ink-muted/60 focus:border-teal/40"
            />

            <p className="mt-auto pt-4 text-[10px] text-ink-muted">
              <kbd>j</kbd>/<kbd>k</kbd> next · <kbd>i</kbd> interested · <kbd>x</kbd> dismiss · <kbd>a</kbd> applied · <kbd>d</kbd> deep dive · <kbd>esc</kbd> close
            </p>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
