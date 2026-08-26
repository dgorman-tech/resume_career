import { DISMISS_REASONS, type DismissReason } from "../lib/dismiss";

/**
 * The one prompt that interrupts triage, so it is deliberately not a modal: it
 * takes no focus and blocks nothing on screen. The global key handler routes
 * 1-6 here while it is open, which keeps dismissing to two keystrokes; the
 * buttons exist for the mouse, not as the primary path.
 */
export function DismissReasonBar({ open, title, company, onPick, onCancel }: {
  open: boolean;
  title: string;
  company: string;
  onPick: (reason: DismissReason | null) => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      role="group"
      aria-label="Dismiss reason"
      aria-live="polite"
      className="panel fixed bottom-4 left-1/2 z-50 flex max-w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center gap-2 px-4 py-3 shadow-overlay"
    >
      <p className="mr-1 max-w-[22ch] truncate text-[13px] text-ink-muted">
        Dismissing <span className="font-semibold text-ink">{title}</span> at {company}
      </p>
      {DISMISS_REASONS.map((r, i) => (
        <button
          key={r.key}
          onClick={() => onPick(r.key)}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-xs font-semibold text-ink transition hover:bg-sunken"
        >
          <kbd className="font-mono text-[10px] text-ink-muted">{i + 1}</kbd>
          {r.label}
        </button>
      ))}
      <button
        onClick={() => onPick(null)}
        className="rounded-full px-3 py-1 text-xs text-ink-muted transition hover:text-ink"
      >
        No reason <kbd className="ml-1 font-mono text-[10px]">x</kbd>
      </button>
      <button
        onClick={onCancel}
        className="rounded-full px-3 py-1 text-xs text-ink-muted transition hover:text-ink"
      >
        Cancel <kbd className="ml-1 font-mono text-[10px]">esc</kbd>
      </button>
    </div>
  );
}
