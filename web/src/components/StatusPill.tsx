import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { clsx } from "clsx";
import type { Status } from "../lib/types";

const LABELS: Record<Status, string> = {
  new: "New",
  interested: "★ Interested",
  dismissed: "✕ Dismissed",
  applied: "✓ Applied",
};

const STYLES: Record<Status, string> = {
  new: "border-white/20 text-ink-muted",
  interested: "border-teal/60 text-teal",
  dismissed: "border-white/10 text-ink-muted/60",
  applied: "border-violet/60 text-violet",
};

export function StatusPill({ status, onChange }: { status: Status; onChange: (s: Status) => void }) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={clsx(
            "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap transition hover:border-white/40",
            STYLES[status],
          )}
        >
          {LABELS[status]} ▾
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="glass z-50 min-w-32 rounded-lg p-1 text-sm" sideOffset={4}>
          {(Object.keys(LABELS) as Status[]).map((s) => (
            <Dropdown.Item
              key={s}
              onSelect={(e) => {
                e.stopPropagation();
                onChange(s);
              }}
              className="cursor-pointer rounded-md px-3 py-1.5 text-ink outline-none data-[highlighted]:bg-white/10"
            >
              {LABELS[s]}
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
