import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { extractResume, getProfile, putProfile } from "../lib/api";
import type { Job, MinLevel } from "../lib/types";

const LEVEL_OPTIONS: { value: MinLevel; label: string }[] = [
  { value: "", label: "Not set" },
  { value: "ic", label: "Individual contributor" },
  { value: "manager", label: "Manager" },
  { value: "senior_manager", label: "Senior Manager" },
  { value: "director", label: "Director" },
  { value: "vp_plus", label: "VP or above" },
];

function toIntOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function ProfilePage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const [resume, setResume] = useState("");
  const [rules, setRules] = useState("");
  const [compFloor, setCompFloor] = useState<number | null>(null);
  const [compGoal, setCompGoal] = useState<number | null>(null);
  const [maxOfficeDays, setMaxOfficeDays] = useState<number | null>(null);
  const [locationText, setLocationText] = useState("");
  const [minLevel, setMinLevel] = useState<MinLevel>("");
  const [extracting, setExtracting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setExtracting(true);
    try {
      setResume(await extractResume(file));
      toast.info("Resume extracted. Review the text below, then Save");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExtracting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  useEffect(() => {
    if (data) {
      setResume(data.resume_text); setRules(data.rules_text);
      setCompFloor(data.comp_floor_cad); setCompGoal(data.comp_goal_cad);
      setMaxOfficeDays(data.max_office_days); setLocationText(data.location_text);
      setMinLevel(data.min_level);
    }
  }, [data]);

  const staleCount = (qc.getQueryData<Job[]>(["jobs"]) ?? []).filter((j) => j.stale).length;

  const save = async () => {
    try {
      await putProfile({
        resume_text: resume, rules_text: rules,
        comp_floor_cad: compFloor, comp_goal_cad: compGoal,
        max_office_days: maxOfficeDays, location_text: locationText, min_level: minLevel,
      });
      await qc.invalidateQueries({ queryKey: ["profile"] });
      await qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Profile saved; existing scores are now flagged stale");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const box = "field w-full resize-y p-4 text-[13px] leading-relaxed";
  const input = "field w-full p-2 text-[13px]";

  return (
    <div className="mx-auto max-w-3xl">
      {staleCount > 0 && (
        <p className="panel mb-4 p-3 text-sm text-amber">
          {staleCount} scored job{staleCount > 1 ? "s were" : " was"} rated against an older profile.
          Re-score them from Health &amp; scoring.
        </p>
      )}
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold">Resume</h2>
        <button onClick={() => fileInput.current?.click()} disabled={extracting}
          className="flex items-center gap-1 rounded-md border border-hairline px-3 py-1 text-xs text-ink transition hover:bg-sunken disabled:opacity-50">
          <Upload className="size-3.5" /> {extracting ? "Extracting…" : "Upload file"}
        </button>
        <input ref={fileInput} type="file" accept=".docx,.pdf,.txt,.md" aria-label="Upload resume file"
          onChange={(e) => void onFile(e.target.files?.[0])} className="hidden" />
      </div>
      <p className="mb-2 max-w-prose text-xs text-ink-muted">
        Plain text; sent with every scoring call. Upload a .docx/.pdf/.txt/.md to extract it here.
      </p>
      <textarea rows={18} aria-label="Resume" value={resume}
        onChange={(e) => setResume(e.target.value)} className={box} />
      <h2 className="mt-6 text-base font-semibold">Hard requirements</h2>
      <p className="mb-2 max-w-prose text-xs text-ink-muted">
        Structured facts the scorer applies consistently every time, instead of parsing them out of prose.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Comp floor (CAD)
          <input type="number" aria-label="Comp floor (CAD)" className={input}
            value={compFloor ?? ""} onChange={(e) => setCompFloor(toIntOrNull(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Comp goal (CAD)
          <input type="number" aria-label="Comp goal (CAD)" className={input}
            value={compGoal ?? ""} onChange={(e) => setCompGoal(toIntOrNull(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Max office days/wk
          <input type="number" min={0} max={5} aria-label="Max office days/week" className={input}
            value={maxOfficeDays ?? ""} onChange={(e) => setMaxOfficeDays(toIntOrNull(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Location
          <input type="text" aria-label="Location" className={input}
            value={locationText} onChange={(e) => setLocationText(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Minimum level
          <select aria-label="Minimum level" className={input}
            value={minLevel} onChange={(e) => setMinLevel(e.target.value as MinLevel)}>
            {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>
      <h2 className="mt-6 text-base font-semibold">Rules & preferences</h2>
      <p className="mb-2 max-w-prose text-xs text-ink-muted">Role shape, cost-center test, sectors, internal lens - anything that needs judgment rather than a hard cutoff.</p>
      <textarea rows={10} value={rules} onChange={(e) => setRules(e.target.value)} className={box} />
      <div className="mt-4 flex items-center gap-3">
        <button onClick={() => void save()}
          className="rounded-md bg-teal px-5 py-1.5 text-sm font-semibold text-paper transition hover:bg-teal-deep">
          Save profile
        </button>
        {data?.updated_at && <span className="text-xs text-ink-muted">last saved {data.updated_at}</span>}
      </div>
    </div>
  );
}
