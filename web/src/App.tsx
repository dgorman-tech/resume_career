import { Hexagon, Settings } from "lucide-react";
import { useState } from "react";
import { GearDialog } from "./components/GearDialog";
import Board from "./pages/Board";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";

export type Tab = "board" | "profile" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("board");
  const [gearOpen, setGearOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-hairline bg-paper px-5 py-3">
        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Hexagon className="size-5 text-teal" />
          <span>Career HQ</span>
        </span>
        <nav className="flex gap-1 text-sm">
          {(["board", "profile", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1 capitalize transition ${
                tab === t ? "bg-teal-wash font-semibold text-teal-deep" : "text-ink-muted hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="grow" />
        <button onClick={() => setGearOpen(true)} aria-label="Settings"
          className="text-ink-muted transition hover:text-ink">
          <Settings className="size-5" />
        </button>
      </header>
      <main className="min-h-0 grow overflow-auto p-5">
        {tab === "board" && <Board />}
        {tab === "profile" && <ProfilePage />}
        {tab === "settings" && <SettingsPage />}
      </main>
      <GearDialog open={gearOpen} onClose={() => setGearOpen(false)} />
    </div>
  );
}
