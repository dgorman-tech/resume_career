import { useEffect, useState } from "react";
import { CURRENCY_OPTIONS, LEVEL_OPTIONS, toIntOrNull } from "../lib/profile";
import type { Currency, MinLevel, Profile } from "../lib/types";
import { EditDialog } from "./EditDialog";

export type Requirements = Pick<
  Profile, "comp_floor" | "comp_goal" | "currency" | "max_office_days" | "location_text" | "min_level"
>;

interface Props {
  open: boolean;
  initial: Requirements;
  onSave: (reqs: Requirements) => void;
  onClose: () => void;
}

const FIELD = "field w-full p-2 text-sm";

function Row({ label, hint, error, children }: {
  label: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] tracking-[0.08em] text-ink-muted">
        {label.toUpperCase()}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {error
        ? <span className="mt-1 block text-xs text-red">{error}</span>
        : hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export function RequirementsDialog({ open, initial, onSave, onClose }: Props) {
  const [reqs, setReqs] = useState<Requirements>(initial);
  useEffect(() => { if (open) setReqs(initial); }, [open, initial]);

  const set = <K extends keyof Requirements>(key: K, value: Requirements[K]) =>
    setReqs({ ...reqs, [key]: value });

  const { comp_floor: floor, comp_goal: goal, currency, max_office_days: office } = reqs;
  const goalError = floor !== null && goal !== null && goal < floor
    ? "Goal sits below your floor. One of the two is wrong." : undefined;
  const officeError = office !== null && (office < 0 || office > 5)
    ? "A week has 5 working days." : undefined;

  return (
    <EditDialog
      open={open} title="Hard requirements" onClose={onClose}
      saveLabel="Save requirements" canSave={!goalError && !officeError}
      onSave={() => onSave(reqs)}
      hint="Facts the scorer applies the same way every time, instead of inferring them from your resume. Anything left unset is omitted from the prompt entirely."
    >
      <div className="space-y-4">
        <Row label="Currency" hint="What your comp figures and the board's salary column are shown in">
          <select
            aria-label="Currency" className={`${FIELD} w-40`} value={currency}
            onChange={(e) => set("currency", e.target.value as Currency)}
          >
            {CURRENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Row>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Comp floor" hint={`${currency} total, walk-away number`}>
            <input
              type="number" aria-label={`Comp floor (${currency})`} className={FIELD} value={floor ?? ""}
              onChange={(e) => set("comp_floor", toIntOrNull(e.target.value))}
            />
          </Row>
          <Row label="Comp goal" hint={`${currency} total, what you're aiming at`} error={goalError}>
            <input
              type="number" aria-label={`Comp goal (${currency})`} className={FIELD} value={goal ?? ""}
              onChange={(e) => set("comp_goal", toIntOrNull(e.target.value))}
            />
          </Row>
        </div>
        <Row label="Max office days" hint="Per week. 0 means remote only." error={officeError}>
          <input
            type="number" min={0} max={5} aria-label="Max office days/week"
            className={`${FIELD} w-24`} value={office ?? ""}
            onChange={(e) => set("max_office_days", toIntOrNull(e.target.value))}
          />
        </Row>
        <Row label="Location" hint="Where you are, in the words a posting would use">
          <input
            type="text" aria-label="Location" className={FIELD} value={reqs.location_text}
            onChange={(e) => set("location_text", e.target.value)}
          />
        </Row>
        <Row label="Minimum level" hint="Stated to the scorer as a minimum. It is not a filter; the board still shows everything.">
          <select
            aria-label="Minimum level" className={FIELD} value={reqs.min_level}
            onChange={(e) => set("min_level", e.target.value as MinLevel)}
          >
            {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Row>
      </div>
    </EditDialog>
  );
}
