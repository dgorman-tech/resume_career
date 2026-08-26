import { useEffect } from "react";
import { reasonForDigit, type DismissReason } from "../lib/dismiss";
import type { Status } from "../lib/types";

export interface KeyboardOpts {
  enabled: boolean;
  keys: string[];
  selectedKey: string | null;
  setSelectedKey: (k: string) => void;
  drawerOpen: boolean;
  setDrawerOpen: (b: boolean) => void;
  setStatus: (key: string, s: Status) => void;
  toggleStar: (key: string) => void;
  startDeepDive: (key: string) => void;
  setFollowUp: (key: string) => void;
  /** true while the reason picker is open; the board holds still until answered */
  dismissPending: boolean;
  startDismiss: (key: string) => void;
  /** null dismisses without recording a reason */
  pickDismissReason: (reason: DismissReason | null) => void;
  cancelDismiss: () => void;
  focusSearch: () => void;
  toggleHelp: () => void;
}

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function useKeyboard(o: KeyboardOpts) {
  useEffect(() => {
    if (!o.enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || (t && (TYPING_TAGS.has(t.tagName) || t.isContentEditable))) return;
      const idx = o.selectedKey ? o.keys.indexOf(o.selectedKey) : -1;
      const move = (delta: number) => {
        if (o.keys.length === 0) return;
        const next = idx < 0 ? 0 : Math.min(o.keys.length - 1, Math.max(0, idx + delta));
        o.setSelectedKey(o.keys[next]);
        const row = document.querySelector<HTMLElement>(`tr[data-key="${CSS.escape(o.keys[next])}"]`);
        row?.scrollIntoView({ block: "nearest" });
        // focus follows selection so the drawer has a row to hand focus back to
        row?.focus({ preventScroll: true });
      };
      const withSelected = (fn: (key: string) => void) => o.selectedKey && fn(o.selectedKey);

      // A pending dismissal owns the keyboard until it is answered: letting j/k
      // move on would land the reason on whatever row the cursor drifted to.
      if (o.dismissPending) {
        switch (e.key) {
          case "Escape": o.cancelDismiss(); return;
          case "x": case "Enter": o.pickDismissReason(null); return;
          default: {
            const reason = reasonForDigit(e.key);
            if (reason) o.pickDismissReason(reason);
            return;
          }
        }
      }

      switch (e.key) {
        case "j": move(1); break;
        case "k": move(-1); break;
        case "Enter": case "o": withSelected(() => o.setDrawerOpen(true)); break;
        case "Escape": o.setDrawerOpen(false); break;
        case "i": withSelected((k) => o.setStatus(k, "interested")); break;
        case "x": withSelected((k) => o.startDismiss(k)); break;
        case "a": withSelected((k) => o.setStatus(k, "applied")); break;
        case "s": withSelected((k) => o.toggleStar(k)); break;
        case "d": withSelected((k) => { o.setDrawerOpen(true); o.startDeepDive(k); }); break;
        case "f": withSelected((k) => { o.setDrawerOpen(true); o.setFollowUp(k); }); break;
        case "/": e.preventDefault(); o.focusSearch(); break;
        case "?": o.toggleHelp(); break;
        default: return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [o]);
}
