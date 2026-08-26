import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ExternalLink, Star, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import type { Dimension, Job, Status } from "../lib/types";
import { SCORING_DISCLOSURE } from "../lib/disclosure";
import { dismissLabel } from "../lib/dismiss";
import { fmtSalary } from "../lib/format";
import { Badges } from "./Badges";
import { DeepDivePanel } from "./DeepDivePanel";
import { JobFactsPanel } from "./JobFactsPanel";
import { ScoreDial } from "./ScoreDial";

export interface NextActionPatch {
  next_action_at?: string;
  next_action_note?: string;
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-mono text-[11px] font-medium tracking-[0.08em] text-ink-muted">{label}</h3>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-ink">{children}</p>
    </div>
  );
}

export function JobDrawer({ job, open, onClose, onStatus, onStar, onNote, onNextAction, onScoreNow, onExtractFacts, extractingFacts, deepDiveRequested, onDeepDiveHandled, followUpRequested, onFollowUpHandled, score, dimensions, currency = "CAD" }: {
  job: Job | null;
  open: boolean;
  onClose: () => void;
  onStatus: (key: string, s: Status) => void;
  onStar: (key: string, starred: boolean) => void;
  onNote: (key: string, note: string) => void;
  onNextAction: (key: string, patch: NextActionPatch) => void;
  onScoreNow: (key: string) => void;
  onExtractFacts: (key: string) => void;
  extractingFacts: boolean;
  deepDiveRequested: boolean;
  onDeepDiveHandled: () => void;
  followUpRequested: boolean;
  onFollowUpHandled: () => void;
  score: number | null;
  dimensions: Dimension[];
  /** the profile's configured currency, used only as a fallback label — see
   *  the salary line below for why job.salary_raw is preferred when present */
  currency?: string;
}) {
  // The global `transition: none` reduced-motion rule in index.css cannot reach a
  // framer-motion inline transform, so the slide has to opt out in JS. The drawer
  // now travels the full width of a 736px panel, which is exactly the sweep that
  // matters to a motion-sensitive user.
  const reduceMotion = useReducedMotion();
  const [note, setNote] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const followUpRef = useRef<HTMLInputElement | null>(null);
  // whatever had focus when the drawer opened, so closing puts the user back
  const restoreRef = useRef<HTMLElement | null>(null);
  const noteTimer = useRef<number | undefined>(undefined);
  // Tracks the most recently typed value not yet flushed to the server, keyed
  // to the job it belongs to, so a fast job switch (j/k) or drawer/component
  // unmount never silently drops an in-flight edit.
  const pendingRef = useRef<{ key: string; value: string } | null>(null);

  useEffect(() => {
    setNote(job?.note ?? "");
    setFollowUpAt(job?.next_action_at ?? "");
    setFollowUpNote(job?.next_action_note ?? "");
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

  // The 'f' shortcut opens the drawer straight onto the date field. This runs on
  // a frame boundary on purpose: Radix's focus scope claims focus when the panel
  // mounts, so focusing synchronously here loses the race and lands on Close.
  // Deferring also covers pressing 'f' while the drawer is already open, where
  // no mount — and so no onOpenAutoFocus — happens at all.
  useEffect(() => {
    if (!followUpRequested || !open || !job) return;
    const frame = requestAnimationFrame(() => {
      followUpRef.current?.focus();
      onFollowUpHandled();
    });
    return () => cancelAnimationFrame(frame);
  }, [followUpRequested, open, job, onFollowUpHandled]);

  const onFollowUpDate = (v: string) => {
    setFollowUpAt(v);
    if (job) onNextAction(job.key, { next_action_at: v });
  };

  const action = (icon: React.ReactNode, label: string, pressed: boolean, cls: string, fn: () => void) => (
    <button onClick={fn} aria-pressed={pressed}
      className={clsx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition", cls)}>
      {icon}{label}
    </button>
  );

  const isOpen = open && !!job;

  return (
    // Radix owns the modal semantics, focus trap, and focus restore; framer-motion
    // keeps the slide. forceMount hands presence to AnimatePresence so the exit
    // animation still runs.
    <Dialog.Root open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AnimatePresence>
        {isOpen && job && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-30 bg-ink/30"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}
              onOpenAutoFocus={(e) => {
                // captured here, while the opener still holds focus
                restoreRef.current = document.activeElement as HTMLElement | null;
                if (!followUpRequested) return;
                e.preventDefault();
                followUpRef.current?.focus();
              }}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                const opener = restoreRef.current;
                if (opener?.isConnected) opener.focus();
                restoreRef.current = null;
              }}>
              {/* Three bands, not one scroll: the identity and the triage controls stay
                  pinned while a long deep dive scrolls past them, so "interested" is
                  never six sections of analysis away from the eye. */}
              <motion.aside
                aria-modal="true"
                className="fixed top-0 right-0 z-40 flex h-full w-[min(46rem,100vw)] flex-col overflow-hidden border-l border-hairline bg-surface shadow-overlay"
                initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
                animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
                transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.25, 1, 0.5, 1] }}
              >
                <header className="shrink-0 border-b border-hairline px-6 pt-6 pb-4 sm:px-10">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Dialog.Title className="text-xl leading-tight font-semibold tracking-tight">
                        {job.title}
                      </Dialog.Title>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted">
                        <span className="font-semibold text-ink">{job.company}</span>
                        <Badges job={job} />
                        <span>{job.location}</span>
                        {/* salary_raw is the verbatim posting text and carries its own currency
                            symbol, so it's the honest figure whenever the source captured it;
                            job.salary_min/max is genuinely a currency-less number pair, and
                            labelling it with the profile's configured currency is only an
                            approximation (correct for a single-country watchlist, not in general) */}
                        <span className="font-mono text-ink">
                          {job.salary_raw || fmtSalary(job.salary_min, job.salary_max, currency)}
                        </span>
                        <a href={job.url} target="_blank" rel="noopener noreferrer"
                           className="inline-flex items-center gap-1 text-teal hover:underline">
                          posting <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      </p>
                    </div>
                    <Dialog.Close aria-label="Close" className="icon-btn -mt-1 shrink-0">
                      <X className="size-5" aria-hidden="true" />
                    </Dialog.Close>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <ScoreDial value={score} size={44} />
                    {job.fit == null ? (
                      <div>
                        <button onClick={() => onScoreNow(job.key)}
                          className="rounded-md bg-teal px-3 py-1 text-xs font-semibold text-paper transition hover:bg-teal-deep">
                          Score now
                        </button>
                        <p className="mt-1 max-w-[42ch] text-[11px] text-ink-muted">{SCORING_DISCLOSURE}</p>
                      </div>
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
                    {job.status === "dismissed" && dismissLabel(job.dismiss_reason) && (
                      <span className="text-xs text-ink-muted">
                        Dismissed: {dismissLabel(job.dismiss_reason)}
                      </span>
                    )}
                    <button onClick={() => onStar(job.key, !job.starred)} aria-pressed={job.starred}
                      aria-label={job.starred ? "Starred" : "Star this job"}
                      className={clsx("icon-btn ml-auto", job.starred && "text-teal hover:text-teal")}>
                      <Star className="size-5" fill={job.starred ? "currentColor" : "none"} aria-hidden="true" />
                    </button>
                  </div>
                </header>

                {/* Job first, then what you write about it, then the deep dive last:
                    it is the only section with no upper bound on length. */}
                <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6 sm:px-10">
                  {job.why && <Block label="WHY">{job.why}</Block>}
                  {job.gaps && <Block label="GAPS">{job.gaps}</Block>}
                  {job.angle && <Block label="ANGLE">{job.angle}</Block>}

                  <JobFactsPanel job={job} onExtract={onExtractFacts} extracting={extractingFacts} />

                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label htmlFor="next-action-at"
                        className="block font-mono text-[11px] font-medium tracking-[0.08em] text-ink-muted">
                        FOLLOW UP
                      </label>
                      <input
                        id="next-action-at"
                        ref={followUpRef}
                        type="date"
                        value={followUpAt}
                        onChange={(e) => onFollowUpDate(e.target.value)}
                        className="field mt-1 px-2 py-1 text-sm"
                      />
                    </div>
                    <input
                      type="text"
                      value={followUpNote}
                      onChange={(e) => setFollowUpNote(e.target.value)}
                      onBlur={() => job && onNextAction(job.key, { next_action_note: followUpNote })}
                      placeholder="What's the next move?"
                      aria-label="Follow-up note"
                      className="field mt-1 min-w-40 flex-1 px-2 py-1 text-sm"
                    />
                  </div>

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
                  <span><kbd>f</kbd> follow up</span>
                  <span><kbd>esc</kbd> close</span>
                </p>
              </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
