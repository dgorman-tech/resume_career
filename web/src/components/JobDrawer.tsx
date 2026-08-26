import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ExternalLink, Star, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import type { Dimension, Job, Status } from "../lib/types";
import { fmtSalary } from "../lib/format";
import { Badges } from "./Badges";
import { DeepDivePanel } from "./DeepDivePanel";
import { ScoreDial } from "./ScoreDial";

export interface NextActionPatch {
  next_action_at?: string;
  next_action_note?: string;
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <h3 className="font-mono text-[11px] font-medium tracking-[0.08em] text-ink-muted">{label}</h3>
      <p className="mt-0.5 text-[13px] leading-relaxed text-ink">{children}</p>
    </div>
  );
}

export function JobDrawer({ job, open, onClose, onStatus, onStar, onNote, onNextAction, onScoreNow, deepDiveRequested, onDeepDiveHandled, followUpRequested, onFollowUpHandled, score, dimensions }: {
  job: Job | null;
  open: boolean;
  onClose: () => void;
  onStatus: (key: string, s: Status) => void;
  onStar: (key: string, starred: boolean) => void;
  onNote: (key: string, note: string) => void;
  onNextAction: (key: string, patch: NextActionPatch) => void;
  onScoreNow: (key: string) => void;
  deepDiveRequested: boolean;
  onDeepDiveHandled: () => void;
  followUpRequested: boolean;
  onFollowUpHandled: () => void;
  score: number | null;
  dimensions: Dimension[];
}) {
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

  // The 'f' shortcut opens the drawer straight onto the date field; hand the
  // request back once honoured so a re-render cannot steal focus again.
  useEffect(() => {
    if (!followUpRequested || !open || !job) return;
    followUpRef.current?.focus();
    onFollowUpHandled();
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
    // keeps the slide-in. forceMount hands presence to AnimatePresence so the exit
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
              <motion.aside
                aria-modal="true"
                className="fixed top-0 right-0 z-40 flex h-full w-[480px] max-w-[90vw] flex-col overflow-y-auto border-l border-hairline bg-surface p-6 shadow-overlay"
                initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }}
                transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
              >
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-xl leading-tight font-semibold tracking-tight">
                  {job.title}
                </Dialog.Title>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <span className="font-semibold text-ink">{job.company}</span>
                  <Badges job={job} />
                  <span>{job.location}</span>
                  <span className="font-mono text-ink">{fmtSalary(job.salary_min, job.salary_max)}</span>
                  <a href={job.url} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1 text-teal hover:underline">
                    posting <ExternalLink className="size-3" />
                  </a>
                </p>
              </div>
              <Dialog.Close aria-label="Close" className="icon-btn -mr-2 shrink-0">
                <X className="size-5" aria-hidden="true" />
              </Dialog.Close>
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

            {job.why && <Block label="WHY">{job.why}</Block>}
            {job.gaps && <Block label="GAPS">{job.gaps}</Block>}
            {job.angle && <Block label="ANGLE">{job.angle}</Block>}

            <DeepDivePanel jobKey={job.key} hasExisting={job.has_deep_dive}
              autoStart={deepDiveRequested} onStarted={onDeepDiveHandled} />

            <div className="mt-5 flex flex-wrap items-center gap-2">
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

            <div className="mt-4 flex flex-wrap items-end gap-3">
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
                  className="field mt-1 px-2 py-1 text-[13px]"
                />
              </div>
              <input
                type="text"
                value={followUpNote}
                onChange={(e) => setFollowUpNote(e.target.value)}
                onBlur={() => job && onNextAction(job.key, { next_action_note: followUpNote })}
                placeholder="What's the next move?"
                aria-label="Follow-up note"
                className="field mt-1 min-w-40 flex-1 px-2 py-1 text-[13px]"
              />
            </div>

            <textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Add note… (autosaves)"
              rows={3}
              className="field mt-4 w-full resize-y p-3 text-[13px]"
            />

            <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-4 text-[11px] text-ink-muted">
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
