import { X } from "lucide-react";
import { useState } from "react";

interface Props {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  hint?: string;
}

export function ChipListInput({ label, values, onChange, hint }: Props) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const kw = draft.trim();
    setDraft("");
    if (!kw || values.includes(kw)) return;
    onChange([...values, kw]);
  };

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs font-semibold text-ink-muted">{label}</label>
        <span className="font-mono text-[11px] text-ink-muted">{values.length}</span>
      </div>
      {hint && <p className="text-[11px] text-ink-muted">{hint}</p>}
      <div className="field mt-1 flex grow flex-wrap content-start items-start gap-1.5 p-2">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-0.5 rounded-full bg-sunken py-0.5 pr-1 pl-2.5 text-xs text-ink">
            {v}
            <button aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}
              className="flex size-4 items-center justify-center rounded-full text-ink-muted transition hover:bg-hairline hover:text-ink">
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          aria-label={label}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
              return;
            }
            // Backspace on an empty draft pulls the last chip back off, the way
            // every other tag input behaves. Editing a typo stops needing the mouse.
            if (e.key === "Backspace" && draft === "" && values.length > 0) {
              e.preventDefault();
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={add}
          placeholder="add…"
          className="min-w-20 grow self-center bg-transparent py-0.5 text-xs text-ink outline-none placeholder:text-ink-muted"
        />
      </div>
    </div>
  );
}
