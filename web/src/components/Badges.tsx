import type { Job } from "../lib/types";

const CHIP = "rounded-sm px-1.5 font-mono text-[10px] font-medium";

export function Badges({ job }: { job: Job }) {
  return (
    <span className="flex items-center gap-1.5">
      {job.is_internal ? (
        // Solid ink: an internal posting is read through a different lens, so it
        // must not look like just another tier chip.
        <span className={`${CHIP} bg-ink text-paper`} title="Internal posting (current employer)">INT</span>
      ) : (
        <span className={`${CHIP} bg-sunken text-ink-muted`} title={`Tier ${job.tier} company`}>
          T{job.tier}
        </span>
      )}
      {job.is_new && (
        <span className={`${CHIP} bg-teal-wash text-teal-deep`} title="First seen in the last 7 days">NEW</span>
      )}
    </span>
  );
}
