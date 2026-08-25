import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { extractResume, getProfile, putProfile } from "../lib/api";
import type { Job } from "../lib/types";

export default function ProfilePage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const [resume, setResume] = useState("");
  const [rules, setRules] = useState("");
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
    if (data) { setResume(data.resume_text); setRules(data.rules_text); }
  }, [data]);

  const staleCount = (qc.getQueryData<Job[]>(["jobs"]) ?? []).filter((j) => j.stale).length;

  const save = async () => {
    try {
      await putProfile({ resume_text: resume, rules_text: rules });
      await qc.invalidateQueries({ queryKey: ["profile"] });
      await qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Profile saved; existing scores are now flagged stale");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const box = "field w-full resize-y p-4 text-[13px] leading-relaxed";

  return (
    <div className="mx-auto max-w-3xl">
      {staleCount > 0 && (
        <p className="panel mb-4 p-3 text-sm text-amber">
          {staleCount} scored job{staleCount > 1 ? "s were" : " was"} rated against an older profile; re-score from the gear dialog.
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
      <p className="mb-2 text-xs text-ink-muted">
        Plain text; sent with every scoring call. Upload a .docx/.pdf/.txt/.md to extract it here.
      </p>
      <textarea rows={18} aria-label="Resume" value={resume}
        onChange={(e) => setResume(e.target.value)} className={box} />
      <h2 className="mt-6 text-base font-semibold">Rules & preferences</h2>
      <p className="mb-2 text-xs text-ink-muted">Comp targets, role shape, cost-center test, flexibility, internal lens.</p>
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
