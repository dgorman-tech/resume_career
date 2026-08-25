import * as Dialog from "@radix-ui/react-dialog";

interface Props {
  open: boolean;
  title: string;
  /** What actually happens. State the consequence, not "are you sure?". */
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The one interaction that earns a modal on this screen: it is destructive, it
 * needs an answer before anything else proceeds, and the consequence has to be
 * read. Native confirm() can't say what stays behind.
 */
export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onClose }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-scrim fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[24rem] -translate-x-1/2 -translate-y-1/2">
          {/* Same shape as EditDialog: the animated panel is a child of the
              positioned shell, so the entrance never fights the centering transform. */}
          <div className="panel dialog-panel p-6 text-sm shadow-overlay">
            <Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>
            <Dialog.Description className="mt-1.5 text-sm text-ink-muted">{body}</Dialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose}
                className="rounded-md px-4 py-1.5 text-sm text-ink-muted transition hover:bg-sunken hover:text-ink">
                Cancel
              </button>
              <button autoFocus onClick={() => { onConfirm(); onClose(); }}
                className="rounded-md bg-red px-4 py-1.5 text-sm font-semibold text-paper transition hover:brightness-90">
                {confirmLabel}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
