import type { Job } from "../lib/types";

export function Badges({ job }: { job: Job }) {
  return (
    <span className="flex items-center gap-1.5">
      {job.is_internal ? (
        <span className="rounded-sm bg-sunken px-1.5 font-mono text-[10px] font-semibold text-ink">INT</span>
      ) : (
        <span className="rounded-sm bg-sunken px-1.5 font-mono text-[10px] font-medium text-ink-muted">
          T{job.tier}
        </span>
      )}
      {job.is_new && (
        <span className="rounded-sm bg-teal-wash px-1.5 font-mono text-[10px] font-medium text-teal-deep">NEW</span>
      )}
    </span>
  );
}
