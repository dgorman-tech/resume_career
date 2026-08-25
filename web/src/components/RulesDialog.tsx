import { useEffect, useState } from "react";
import { EditDialog } from "./EditDialog";

interface Props {
  open: boolean;
  initial: string;
  onSave: (rules: string) => void;
  onClose: () => void;
}

export function RulesDialog({ open, initial, onSave, onClose }: Props) {
  const [text, setText] = useState(initial);
  useEffect(() => { if (open) setText(initial); }, [open, initial]);

  return (
    <EditDialog
      open={open} width="lg" title="Rules & preferences" onClose={onClose}
      saveLabel="Save rules" onSave={() => onSave(text)}
      hint="Role shape, cost-center test, sectors, internal lens: anything that needs judgment rather than a hard cutoff."
    >
      <textarea
        rows={16} aria-label="Rules and preferences" value={text}
        onChange={(e) => setText(e.target.value)}
        className="field w-full resize-y p-4 text-[13px] leading-relaxed"
      />
    </EditDialog>
  );
}
