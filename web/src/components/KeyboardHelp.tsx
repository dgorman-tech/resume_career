import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

const KEYS: Array<[string[], string]> = [
  [["j", "k"], "move selection"], [["Enter", "o"], "open drawer"], [["Esc"], "close drawer"],
  [["i"], "mark interested"], [["x"], "dismiss"], [["a"], "mark applied"], [["s"], "star"],
  [["d"], "deep dive"], [["/"], "focus search"], [["?"], "this help"],
];

export function KeyboardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content className="panel fixed top-1/2 left-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 p-6 shadow-overlay">
          <div className="mb-3 flex items-center justify-between gap-4">
            <Dialog.Title className="text-[15px] font-semibold">Keyboard</Dialog.Title>
            <Dialog.Close aria-label="Close" className="icon-btn -mr-2 shrink-0">
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {KEYS.map(([keys, desc]) => (
                <tr key={desc}>
                  <td className="w-24 py-1 pr-4 whitespace-nowrap">
                    {keys.map((k) => <kbd key={k} className="mr-1">{k}</kbd>)}
                  </td>
                  <td className="text-ink-muted">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
