import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { extractResume } from "../lib/api";
import { wordCount } from "../lib/profile";
import { EditDialog } from "./EditDialog";

interface Props {
  open: boolean;
  initial: string;
  onSave: (resume: string) => void;
  onClose: () => void;
}

export function ResumeDialog({ open, initial, onSave, onClose }: Props) {
  const [text, setText] = useState(initial);
  const [extracting, setExtracting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) setText(initial); }, [open, initial]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setExtracting(true);
    try {
      setText(await extractResume(file));
      toast.info("Resume extracted. Review the text, then Save");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExtracting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const upload = (
    <>
      <button
        onClick={() => fileInput.current?.click()}
        disabled={extracting}
        className="flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-sm text-ink transition hover:bg-sunken disabled:opacity-50"
      >
        <Upload className="size-3.5" aria-hidden="true" />
        {extracting ? "Extracting…" : "Replace from file"}
      </button>
      <input
        ref={fileInput} type="file" accept=".docx,.pdf,.txt,.md" className="hidden"
        aria-label="Upload resume file"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <span className="font-mono text-[11px] tracking-[0.08em] text-ink-muted">
        {wordCount(text)} WORDS
      </span>
    </>
  );

  return (
    <EditDialog
      open={open} width="lg" title="Resume" onClose={onClose} footerLeft={upload}
      saveLabel="Save resume" onSave={() => onSave(text)}
      hint="Plain text, sent verbatim with every scoring call. Upload a .docx/.pdf/.txt/.md to replace it, then review before saving."
    >
      <textarea
        rows={20} aria-label="Resume" value={text} onChange={(e) => setText(e.target.value)}
        className="field w-full resize-y p-4 text-[13px] leading-relaxed"
      />
    </EditDialog>
  );
}
