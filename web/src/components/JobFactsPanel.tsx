import { AlertTriangle, ScanText } from "lucide-react";
import { FACTS_DISCLOSURE } from "../lib/disclosure";
import type { Job, JobFacts } from "../lib/types";

const LEVEL_LABELS: Record<string, string> = {
  ic: "Individual contributor", manager: "Manager", senior_manager: "Senior Manager",
  director: "Director", vp_plus: "VP or above",
};

/** How each scalar fact reads on screen. Order is the order shown. */
const ROWS: Array<{ field: keyof JobFacts; label: string; format: (v: never) => string }> = [
  { field: "remote_policy", label: "Remote policy", format: (v: string) => v },
  { field: "office_days", label: "Office days", format: (v: number) => `${v} days/week` },
  { field: "years_min", label: "Experience", format: (v: number) => `${v}+ years` },
  { field: "level", label: "Level", format: (v: string) => LEVEL_LABELS[v] ?? v },
  { field: "apply_deadline", label: "Applications close", format: (v: string) => v },
  { field: "visa_or_clearance", label: "Eligibility", format: (v: string) => v },
];

function Quote({ text }: { text: string }) {
  return (
    <p className="mt-0.5 max-w-[52ch] text-[11px] leading-relaxed text-ink-muted italic">
      "{text}"
    </p>
  );
}

/**
 * Facts read out of the JD, each shown with the sentence it came from. The quote
 * is not tucked behind a toggle on purpose: an unsourced fact here would carry
 * the authority of a measurement while being a guess.
 */
export function JobFactsPanel({ job, onExtract, extracting }: {
  job: Job;
  onExtract: (key: string) => void;
  extracting: boolean;
}) {
  const f = job.facts;
  const evidence = f?.evidence ?? {};
  const quoteFor = (field: string) => {
    const q = evidence[field];
    return typeof q === "string" ? q : null;
  };
  const mustHaveQuotes = Array.isArray(evidence.must_haves) ? evidence.must_haves : [];

  const button = (
    <button
      onClick={() => onExtract(job.key)}
      disabled={extracting}
      className="flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1 text-xs font-semibold text-ink transition hover:bg-sunken disabled:opacity-50"
    >
      <ScanText className="size-3.5" aria-hidden="true" />
      {extracting ? "Reading…" : f ? "Re-read" : "Read the description"}
    </button>
  );

  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-mono text-[11px] font-medium tracking-[0.08em] text-ink-muted">
          JD FACTS
        </h3>
        {button}
      </div>

      {!f && <p className="max-w-[52ch] text-[11px] text-ink-muted">{FACTS_DISCLOSURE}</p>}

      {job.conflicts.length > 0 && (
        <div className="mb-3 rounded-md border border-amber/40 bg-amber/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            Against your stated requirements
          </p>
          {job.conflicts.map((c) => (
            <div key={c.field} className="mt-1.5">
              <p className="text-[13px] text-ink">{c.message}</p>
              {c.quote && <Quote text={c.quote} />}
            </div>
          ))}
          <p className="mt-2 text-[11px] text-ink-muted">
            Flagged only — this does not dismiss anything.
          </p>
        </div>
      )}

      {f && (
        <dl className="space-y-2">
          {ROWS.map(({ field, label, format }) => {
            const value = f[field];
            if (value == null || value === "") return null;
            const quote = quoteFor(field);
            return (
              <div key={field}>
                <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-muted uppercase">
                  {label}
                </dt>
                <dd className="text-[13px] text-ink">{format(value as never)}</dd>
                {quote ? <Quote text={quote} /> : (
                  // extraction never stores an unsourced fact, so this means the
                  // row predates the evidence rule or was written by hand
                  <p className="mt-0.5 text-[11px] text-amber">No quote recorded — treat as unverified.</p>
                )}
              </div>
            );
          })}

          {f.must_haves.length > 0 && (
            <div>
              <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-muted uppercase">
                Must haves
              </dt>
              {f.must_haves.map((m, i) => (
                <dd key={m} className="mt-1 text-[13px] text-ink">
                  <span>{m}</span>
                  {mustHaveQuotes[i] && <Quote text={mustHaveQuotes[i]} />}
                </dd>
              ))}
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
