import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { clsx } from "clsx";
import type { Status } from "../lib/types";

const PILL_LABELS: Record<Status, string> = {
  new: "NEW",
  interested: "INTERESTED",
  dismissed: "DISMISSED",
  applied: "APPLIED",
};

const MENU_LABELS: Record<Status, string> = {
  new: "New",
  interested: "Interested",
  dismissed: "Dismissed",
  applied: "Applied",
};

const STYLES: Record<Status, string> = {
  new: "bg-sunken text-ink-muted hover:text-ink",
  interested: "bg-teal-wash text-teal-deep",
  dismissed: "text-ink-faint hover:text-ink-muted",
  applied: "bg-teal text-paper",
};

export function StatusPill({ status, onChange }: { status: Status; onChange: (s: Status) => void }) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={clsx(
            "rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-[0.08em] whitespace-nowrap transition",
            STYLES[status],
          )}
        >
          {PILL_LABELS[status]} ▾
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="panel z-50 min-w-32 rounded-md p-1 text-sm shadow-raised" sideOffset={4}>
          {(Object.keys(PILL_LABELS) as Status[]).map((s) => (
            <Dropdown.Item
              key={s}
              onSelect={(e) => {
                e.stopPropagation();
                onChange(s);
              }}
              className="cursor-pointer rounded-sm px-3 py-1.5 text-ink outline-none data-[highlighted]:bg-sunken"
            >
              {MENU_LABELS[s]}
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
