import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ExternalLink, Star, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import type { Dimension, Job, Status } from "../lib/types";
import { fmtSalary } from "../lib/format";
import { Badges } from "./Badges";
import { DeepDivePanel } from "./DeepDivePanel";
import { ScoreDial } from "./ScoreDial";

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-mono text-[11px] font-medium tracking-[0.08em] text-ink-muted">{label}</h3>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-ink">{children}</p>
    </div>
  );
}

export function JobDrawer({ job, open, onClose, onStatus, onStar, onNote, onScoreNow, deepDiveRequested, onDeepDiveHandled, score, dimensions }: {
  job: Job | null;
  open: boolean;
  onClose: () => void;
  onStatus: (key: string, s: Status) => void;
  onStar: (key: string, starred: boolean) => void;
  onNote: (key: string, note: string) => void;
  onScoreNow: (key: string) => void;
  deepDiveRequested: boolean;
  onDeepDiveHandled: () => void;
  score: number | null;
  dimensions: Dimension[];
}) {
  // The global `transition: none` reduced-motion rule in index.css cannot reach a
  // framer-motion inline transform, so the slide has to opt out in JS. The drawer
  // now travels the full width of a 736px panel, which is exactly the sweep that
  // matters to a motion-sensitive user.
  const reduceMotion = useReducedMotion();
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

  const action = (icon: React.ReactNode, label: string, pressed: boolean, cls: string, fn: () => void) => (
    <button onClick={fn} aria-pressed={pressed}
      className={clsx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition", cls)}>
      {icon}{label}
    </button>
  );

  return (
    <AnimatePresence>
      {open && job && (
        <>
          <motion.div
            className="fixed inset-0 z-30 bg-ink/30"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* Three bands, not one scroll: the identity and the triage controls stay
              pinned while a long deep dive scrolls past them, so "interested" is
              never six sections of analysis away from the eye. */}
          <motion.aside
            key={job.key}
            className="fixed top-0 right-0 z-40 flex h-full w-[min(46rem,100vw)] flex-col overflow-hidden border-l border-hairline bg-surface shadow-overlay"
            initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.25, 1, 0.5, 1] }}
          >
            <header className="shrink-0 border-b border-hairline px-6 pt-6 pb-4 sm:px-10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl leading-tight font-semibold tracking-tight">{job.title}</h2>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted">
                    <span className="font-semibold text-ink">{job.company}</span>
                    <Badges job={job} />
                    <span>{job.location}</span>
                    <span className="font-mono text-ink">{fmtSalary(job.salary_min, job.salary_max)}</span>
                    <a href={job.url} target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-1 text-teal hover:underline">
                      posting <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  </p>
                </div>
                <button onClick={onClose} aria-label="Close" className="icon-btn -mt-1 shrink-0">
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <ScoreDial value={score} size={44} />
                {job.fit == null ? (
                  <button onClick={() => onScoreNow(job.key)}
                    className="rounded-md bg-teal px-3 py-1 text-xs font-semibold text-paper transition hover:bg-teal-deep">
                    Score now
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink">
                      MODEL {job.fit}
                    </span>
                    {dimensions.map((d) => (
                      <span key={d.key} className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-muted">
                        {d.label.toUpperCase()} {job.subscores?.[d.key] ?? "—"}
                      </span>
                    ))}
                    {job.stale && <span className="text-[11px] text-amber">profile or rubric changed since scoring</span>}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {action(<Star className="size-3.5" aria-hidden="true" />, "Interested", job.status === "interested",
                  job.status === "interested" ? "border-transparent bg-teal-wash text-teal-deep" : "border-hairline text-ink-muted hover:text-ink",
                  () => onStatus(job.key, "interested"))}
                {action(<X className="size-3.5" aria-hidden="true" />, "Dismissed", job.status === "dismissed",
                  job.status === "dismissed" ? "border-transparent bg-sunken text-ink" : "border-hairline text-ink-muted hover:text-ink",
                  () => onStatus(job.key, "dismissed"))}
                {action(<Check className="size-3.5" aria-hidden="true" />, "Applied", job.status === "applied",
                  job.status === "applied" ? "border-transparent bg-teal text-paper" : "border-hairline text-ink-muted hover:text-ink",
                  () => onStatus(job.key, "applied"))}
                <button onClick={() => onStar(job.key, !job.starred)} aria-pressed={job.starred}
                  aria-label={job.starred ? "Starred" : "Star this job"}
                  className={clsx("icon-btn ml-auto", job.starred && "text-teal hover:text-teal")}>
                  <Star className="size-5" fill={job.starred ? "currentColor" : "none"} aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6 sm:px-10">
              {job.why && <Block label="WHY">{job.why}</Block>}
              {job.gaps && <Block label="GAPS">{job.gaps}</Block>}
              {job.angle && <Block label="ANGLE">{job.angle}</Block>}

              <textarea
                value={note}
                onChange={(e) => onNoteChange(e.target.value)}
                placeholder="Add note… (autosaves)"
                rows={3}
                className="field w-full resize-y p-3 text-sm"
              />

              <DeepDivePanel jobKey={job.key} hasExisting={job.has_deep_dive}
                autoStart={deepDiveRequested} onStarted={onDeepDiveHandled} />
            </div>

            <p className="hidden shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline px-6 py-3 text-[11px] text-ink-muted sm:flex sm:px-10">
              <span><kbd>j</kbd> <kbd>k</kbd> next</span>
              <span><kbd>i</kbd> interested</span>
              <span><kbd>x</kbd> dismiss</span>
              <span><kbd>a</kbd> applied</span>
              <span><kbd>d</kbd> deep dive</span>
              <span><kbd>esc</kbd> close</span>
            </p>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
