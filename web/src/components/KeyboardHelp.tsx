import * as Dialog from "@radix-ui/react-dialog";

const KEYS: Array<[string, string]> = [
  ["j / k", "move selection"], ["Enter / o", "open drawer"], ["Esc", "close drawer"],
  ["i", "mark interested"], ["x", "dismiss"], ["a", "mark applied"], ["s", "star"],
  ["d", "deep dive"], ["/", "focus search"], ["?", "this help"],
];

export function KeyboardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content className="panel fixed top-1/2 left-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 p-5 shadow-overlay">
          <Dialog.Title className="mb-3 text-[15px] font-semibold">Keyboard</Dialog.Title>
          <table className="w-full text-sm">
            <tbody>
              {KEYS.map(([k, desc]) => (
                <tr key={k}>
                  <td className="py-1 pr-4 font-mono text-xs text-ink">{k}</td>
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
