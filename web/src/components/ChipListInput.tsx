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
    <div>
      <label className="text-xs font-semibold text-ink-muted">{label}</label>
      {hint && <p className="text-[11px] text-ink-muted">{hint}</p>}
      <div className="field mt-1 flex flex-wrap items-center gap-1.5 p-2 focus-within:border-teal">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-full bg-sunken px-2.5 py-0.5 text-xs text-ink">
            {v}
            <button aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-ink-muted transition hover:text-ink">
              <X className="size-3" />
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
            }
          }}
          onBlur={add}
          placeholder="add…"
          className="min-w-24 grow bg-transparent text-xs text-ink outline-none placeholder:text-ink-muted"
        />
      </div>
    </div>
  );
}
