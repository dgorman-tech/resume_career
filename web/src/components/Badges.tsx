import type { Job } from "../lib/types";

export function Badges({ job }: { job: Job }) {
  return (
    <span className="flex items-center gap-1.5">
      {job.is_internal ? (
        <span className="rounded border border-rose/50 bg-rose/15 px-1.5 text-[10px] font-bold text-rose">INT</span>
      ) : (
        <span className="rounded bg-white/10 px-1.5 font-[family-name:var(--font-mono)] text-[10px] font-bold text-ink-muted">
          T{job.tier}
        </span>
      )}
      {job.is_new && (
        <span className="rounded border border-teal/50 bg-teal/15 px-1.5 text-[10px] font-bold text-teal">NEW</span>
      )}
    </span>
  );
}
