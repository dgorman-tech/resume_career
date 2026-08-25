import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EditDialog } from "../components/EditDialog";
import type { Requirements } from "../components/RequirementsDialog";
import { RequirementsDialog } from "../components/RequirementsDialog";
import { ResumeDialog } from "../components/ResumeDialog";
import { RubricEditor } from "../components/RubricEditor";
import { RulesDialog } from "../components/RulesDialog";
import { getDimensions, getJobs, getProfile, putProfile } from "../lib/api";
import { fmtAge, fmtSalary } from "../lib/format";
import { levelLabel, wordCount } from "../lib/profile";
import type { Profile } from "../lib/types";

type Surface = "resume" | "requirements" | "rules" | "rubric";

const EMPTY: Profile = {
  resume_text: "", rules_text: "", comp_floor_cad: null, comp_goal_cad: null,
  max_office_days: null, location_text: "", min_level: "", updated_at: null,
};

/** A named criterion in the spec strip. A null value renders as an honest "Not set". */
function Criterion({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="font-mono text-[11px] tracking-[0.08em] text-ink-muted">{label}</dt>
      <dd className={value === null
        ? "mt-1 text-[15px] text-ink-muted"
        : `mt-1 text-[15px] font-semibold text-ink ${mono ? "font-mono" : ""}`}>
        {value ?? "Not set"}
      </dd>
    </div>
  );
}

function SectionHead({ title, meta, onEdit }: { title: string; meta?: string; onEdit: () => void }) {
  return (
    <div className="mb-2 flex items-baseline gap-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {meta && <span className="font-mono text-[11px] tracking-[0.08em] text-ink-muted">{meta}</span>}
      <div className="grow" />
      <button
        onClick={onEdit}
        aria-label={`Edit ${title.toLowerCase()}`}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-muted transition hover:bg-sunken hover:text-ink"
      >
        <Pencil className="size-3.5" aria-hidden="true" /> Edit
      </button>
    </div>
  );
}

export default function ProfilePage({ onOpenHealth }: { onOpenHealth?: () => void } = {}) {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const { data: jobs } = useQuery({ queryKey: ["jobs"], queryFn: getJobs });
  const { data: rubric } = useQuery({ queryKey: ["dimensions"], queryFn: getDimensions });
  const [surface, setSurface] = useState<Surface | null>(null);

  const profile = data ?? EMPTY;
  const scored = (jobs ?? []).filter((j) => j.fit !== null);
  const stale = scored.filter((j) => j.stale).length;
  const active = (rubric?.dimensions ?? []).filter((d) => !d.archived);
  const archived = (rubric?.dimensions ?? []).filter((d) => d.archived).length;

  const save = async (patch: Partial<Profile>) => {
    const next = { ...profile, ...patch };
    try {
      await putProfile({
        resume_text: next.resume_text, rules_text: next.rules_text,
        comp_floor_cad: next.comp_floor_cad, comp_goal_cad: next.comp_goal_cad,
        max_office_days: next.max_office_days, location_text: next.location_text,
        min_level: next.min_level,
      });
      await qc.invalidateQueries({ queryKey: ["profile"] });
      await qc.invalidateQueries({ queryKey: ["jobs"] });
      setSurface(null);
      toast.success("Profile saved; existing scores are now flagged stale");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (isPending) {
    return (
      <div className="mx-auto max-w-6xl space-y-4" aria-busy="true" aria-label="Loading profile">
        <div className="panel h-24 animate-pulse bg-sunken" />
        <div className="panel h-40 animate-pulse bg-sunken" />
      </div>
    );
  }

  const words = wordCount(profile.resume_text);

  return (
    <div className="mx-auto grid max-w-6xl gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-10">
        <section>
          <SectionHead title="Hard requirements" onEdit={() => setSurface("requirements")} />
          <dl className="panel grid grid-cols-2 gap-px overflow-hidden bg-hairline sm:grid-cols-3 lg:grid-cols-5">
            <Criterion label="COMP FLOOR" mono
              value={profile.comp_floor_cad ? fmtSalary(profile.comp_floor_cad, null) : null} />
            <Criterion label="COMP GOAL" mono
              value={profile.comp_goal_cad ? fmtSalary(profile.comp_goal_cad, null) : null} />
            <Criterion label="OFFICE DAYS" mono
              value={profile.max_office_days === null ? null : `${profile.max_office_days}/wk max`} />
            <Criterion label="LOCATION" value={profile.location_text || null} />
            <Criterion label="MIN LEVEL" value={levelLabel(profile.min_level)} />
          </dl>
        </section>

        <section>
          <SectionHead
            title="Resume"
            meta={words > 0 ? `${words.toLocaleString()} WORDS` : undefined}
            onEdit={() => setSurface("resume")}
          />
          {words === 0 ? (
            <div className="rounded-lg border border-dashed border-ink-faint p-6">
              <p className="max-w-[62ch] text-sm text-ink-muted">
                No resume saved. Every fit score is the model comparing a posting against this text,
                so until it exists the scores are guesses about a stranger.
              </p>
              <button
                onClick={() => setSurface("resume")}
                className="mt-3 rounded-md bg-teal px-5 py-1.5 text-sm font-semibold text-paper transition hover:bg-teal-deep"
              >
                Add resume
              </button>
            </div>
          ) : (
            <div className="panel p-4">
              <p className="line-clamp-5 max-w-[70ch] text-[13px] leading-relaxed whitespace-pre-line text-ink-muted">
                {profile.resume_text}
              </p>
            </div>
          )}
        </section>

        <section>
          <SectionHead title="Rules and preferences" onEdit={() => setSurface("rules")} />
          {profile.rules_text.trim() === "" ? (
            <div className="rounded-lg border border-dashed border-ink-faint p-6">
              <p className="max-w-[62ch] text-sm text-ink-muted">
                No rules yet. This is where the judgment calls live: role shape, sectors, the
                cost-center test. Without them the scorer reads a posting on its own terms.
              </p>
              <button
                onClick={() => setSurface("rules")}
                className="mt-3 rounded-md border border-hairline px-4 py-1.5 text-sm text-ink transition hover:bg-sunken"
              >
                Write rules
              </button>
            </div>
          ) : (
            <div className="panel p-4">
              <p className="max-w-[70ch] text-[13px] leading-relaxed whitespace-pre-line text-ink">
                {profile.rules_text}
              </p>
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-8 lg:sticky lg:top-0 lg:self-start">
        <section>
          <p className="font-mono text-[11px] tracking-[0.08em] text-ink-muted">PROFILE STATUS</p>
          <p className="mt-2 text-sm text-ink">
            {profile.updated_at ? `Saved ${fmtAge(profile.updated_at)}` : "Never saved"}
          </p>
          <p className="mt-1 font-mono text-[11px] tracking-[0.08em] text-ink-muted">
            <span className="font-medium text-ink">{scored.length}</span> SCORED
          </p>
          {stale > 0 && (
            <div className="mt-3">
              <p className="max-w-[38ch] text-xs text-amber">
                {stale} of them {stale === 1 ? "was" : "were"} rated against an older profile or
                rubric, so {stale === 1 ? "its" : "their"} fit numbers no longer match what you see
                here.
              </p>
              {onOpenHealth && (
                <button
                  onClick={onOpenHealth}
                  className="mt-2 rounded-md border border-hairline px-3 py-1 text-xs text-ink transition hover:bg-sunken"
                >
                  Open health and scoring
                </button>
              )}
            </div>
          )}
        </section>

        <section>
          <SectionHead title="Scoring rubric" onEdit={() => setSurface("rubric")} />
          <ol className="panel divide-y divide-hairline overflow-hidden">
            {active.map((d, i) => (
              <li key={d.key ?? i} className="flex items-baseline gap-3 px-3 py-2">
                <span className="font-mono text-[11px] text-ink-muted">{i + 1}</span>
                <span className="text-[13px] text-ink">{d.label}</span>
              </li>
            ))}
            {active.length === 0 && (
              <li className="px-3 py-2 text-[13px] text-ink-muted">No dimensions defined</li>
            )}
          </ol>
          {archived > 0 && (
            <p className="mt-2 font-mono text-[11px] tracking-[0.08em] text-ink-muted">
              {archived} ARCHIVED
            </p>
          )}
        </section>
      </aside>

      <ResumeDialog
        open={surface === "resume"} initial={profile.resume_text}
        onSave={(resume_text) => void save({ resume_text })} onClose={() => setSurface(null)}
      />
      <RulesDialog
        open={surface === "rules"} initial={profile.rules_text}
        onSave={(rules_text) => void save({ rules_text })} onClose={() => setSurface(null)}
      />
      <RequirementsDialog
        open={surface === "requirements"}
        initial={profile as Requirements}
        onSave={(reqs) => void save(reqs)} onClose={() => setSurface(null)}
      />
      <EditDialog
        open={surface === "rubric"} width="lg" ownActions title="Scoring rubric"
        onClose={() => setSurface(null)}
        hint="The model scores every job against these dimensions. Editing definitions marks existing scores stale until re-scored; ranking weights live on the Board and never require re-scoring."
      >
        <RubricEditor onSaved={() => setSurface(null)} />
      </EditDialog>
    </div>
  );
}
