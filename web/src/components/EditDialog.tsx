import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

const WIDTHS = {
  sm: "w-[26rem]",
  md: "w-[34rem]",
  lg: "w-[min(52rem,calc(100vw-3rem))]",
} as const;

interface Props {
  open: boolean;
  title: string;
  /** One line explaining what the scorer does with this. Required: Radix wants a
   *  description on every dialog, and an editing surface with no explanation is a defect. */
  hint: string;
  width?: keyof typeof WIDTHS;
  saveLabel?: string;
  canSave?: boolean;
  onSave?: () => void;
  onClose: () => void;
  /** Secondary controls that belong beside the content, not above it (e.g. Upload). */
  footerLeft?: React.ReactNode;
  /** The content brings its own save/cancel row (the rubric editor does). Suppresses the footer. */
  ownActions?: boolean;
  children: React.ReactNode;
}

/**
 * The one editing surface for profile configuration. Every profile edit opens the
 * same shell so the save vocabulary never drifts between fields.
 */
export function EditDialog({
  open, title, hint, width = "md", saveLabel = "Save",
  canSave = true, onSave, onClose, footerLeft, ownActions, children,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-scrim fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            // Radix would land on the close button. An editing dialog should open with the
            // caret already in the first field; nobody opens one to press Escape.
            const first = (e.target as HTMLElement | null)
              ?.querySelector<HTMLElement>("input, textarea, select");
            if (!first) return;
            e.preventDefault();
            first.focus();
          }}
          className={`fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 ${WIDTHS[width]}`}
        >
          {/* The animated panel is a child of the positioned shell, so the entrance
              animation never touches the transform that does the centering. */}
          <div className="panel dialog-panel flex max-h-[85vh] flex-col p-6 text-sm shadow-overlay">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>
                <Dialog.Description className="mt-1 max-w-[62ch] text-xs text-ink-muted">
                  {hint}
                </Dialog.Description>
              </div>
              <Dialog.Close aria-label="Close" className="icon-btn -mt-2 -mr-2 shrink-0">
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </div>

            <div className="-mx-6 mt-4 min-h-0 grow overflow-auto px-6">{children}</div>

            {!ownActions && (
              <div className="mt-4 flex items-center gap-3 border-t border-hairline pt-4">
                {footerLeft}
                <div className="grow" />
                <button
                  onClick={onClose}
                  className="rounded-md px-3 py-1.5 text-sm text-ink-muted transition hover:bg-sunken hover:text-ink"
                >
                  Cancel
                </button>
                {onSave && (
                  <button
                    onClick={onSave}
                    disabled={!canSave}
                    className="rounded-md bg-teal px-5 py-1.5 text-sm font-semibold text-paper transition hover:bg-teal-deep disabled:opacity-50"
                  >
                    {saveLabel}
                  </button>
                )}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
