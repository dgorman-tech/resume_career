import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChipListInput } from "../components/ChipListInput";
import { CompanyDialog } from "../components/CompanyDialog";
import { CompanyTable, companyKey, type RowTest } from "../components/CompanyTable";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { getSettings, putSettings, testCompany } from "../lib/api";
import type { Company, Filters, Settings } from "../lib/types";

const TITLE_FIELDS: { key: keyof Filters; label: string; hint: string }[] = [
  { key: "title_domain", label: "Domain keywords", hint: "a title must contain one of these…" },
  { key: "title_seniority", label: "Seniority keywords", hint: "…and one of these to match" },
  { key: "title_exclude", label: "Excluded words", hint: "any of these vetoes the title" },
];

const LOCATION_FIELDS: { key: keyof Filters; label: string; hint: string }[] = [
  { key: "location_include", label: "Allowed locations", hint: "empty means every location matches" },
  { key: "location_exclude", label: "Excluded locations", hint: "any of these vetoes the location" },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const GROUP = "font-mono text-[11px] font-medium tracking-[0.08em] text-ink-muted lg:col-span-3";
const H2 = "text-base font-semibold";
const INPUT = "field mt-0.5 w-full px-2.5 py-1.5 text-sm";
const FIELD_LABEL = "block text-xs font-semibold text-ink-muted";

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [tests, setTests] = useState<Record<string, RowTest>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setSettings(data);
  }, [data]);

  // Which sections drifted from what is on disk. Named parts beat a bare dot:
  // "unsaved" is only useful if it says what is unsaved.
  const dirtyParts = useMemo(() => {
    if (!data || !settings) return [];
    return [
      same(settings.companies, data.companies) ? null : "companies",
      same(settings.filters, data.filters) ? null : "filters",
      same(settings.app, data.app) && settings.ntfy_topic === data.ntfy_topic ? null : "advanced",
    ].filter((p): p is string => p !== null);
  }, [data, settings]);
  const dirty = dirtyParts.length > 0;

  const save = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await putSettings(settings);
      setSettings(updated);
      qc.setQueryData(["settings"], updated);
      toast.success("Settings saved; changes take effect on the next watcher run");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [settings, qc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, saving, save]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!settings) {
    return (
      <div className="panel space-y-px overflow-hidden" aria-busy="true" aria-label="Loading settings">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse bg-sunken" />
        ))}
      </div>
    );
  }

  const patch = (p: Partial<Settings>) => setSettings({ ...settings, ...p });

  const saveCompany = (company: Company) => {
    const companies = dialog.index === null
      ? [...settings.companies, company]
      : settings.companies.map((c, i) => (i === dialog.index ? company : c));
    patch({ companies });
    setDialog({ open: false, index: null });
  };

  const removeCompany = (index: number) => {
    patch({ companies: settings.companies.filter((_, i) => i !== index) });
  };

  const testRow = async (index: number) => {
    const c = settings.companies[index];
    const key = companyKey(c);
    setTests((t) => ({ ...t, [key]: { kind: "loading" } }));
    try {
      const r = await testCompany(c);
      const sample = r.sample_titles[0] ?? null;
      setTests((t) => ({ ...t, [key]: { kind: "ok", jobs: r.jobs_found, sample } }));
      toast.success(`${c.name}: found ${r.jobs_found} jobs${sample ? ` — e.g. “${sample}”` : ""}`);
    } catch (e) {
      const error = (e as Error).message;
      setTests((t) => ({ ...t, [key]: { kind: "failed", error } }));
      toast.error(`${c.name}: ${error}`);
    }
  };

  const chipField = ({ key, label, hint }: { key: keyof Filters; label: string; hint: string }) => (
    <ChipListInput key={key} label={label} hint={hint} values={settings.filters[key]}
      onChange={(values) => patch({ filters: { ...settings.filters, [key]: values } })} />
  );

  const doomed = pendingDelete === null ? null : settings.companies[pendingDelete];

  return (
    <div className="space-y-8 pb-4">
      {/* Sticky because the edits are down the page and the save is not: the
          state of the config should never be more than a glance away. */}
      <div className="sticky -top-6 z-10 -mx-6 -mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline bg-paper px-6 pt-6 pb-3">
        <p aria-live="polite" className="text-sm">
          {dirty ? (
            <>
              <span className="font-semibold text-amber">Unsaved</span>
              <span className="text-ink-muted"> changes in {dirtyParts.join(", ")}</span>
            </>
          ) : (
            <span className="text-ink-muted">Everything saved to config.json</span>
          )}
        </p>
        <span className="text-xs text-ink-muted">Applies on the next watcher run</span>
        <div className="grow" />
        {dirty && (
          <button onClick={() => data && setSettings(data)}
            className="rounded-md px-3 py-1.5 text-sm text-ink-muted transition hover:bg-sunken hover:text-ink">
            Discard
          </button>
        )}
        <button onClick={() => void save()} disabled={saving || !dirty}
          className="rounded-md bg-teal px-5 py-1.5 text-sm font-semibold text-paper transition hover:bg-teal-deep disabled:bg-sunken disabled:text-ink-muted">
          {saving ? "Saving…" : "Save settings"}
        </button>
        <kbd className="hidden sm:inline">Ctrl S</kbd>
      </div>

      <section>
        <h2 className={`${H2} mb-2`}>Companies</h2>
        <CompanyTable
          companies={settings.companies}
          tests={tests}
          onAdd={() => setDialog({ open: true, index: null })}
          onEdit={(index) => setDialog({ open: true, index })}
          onDelete={setPendingDelete}
          onTest={(index) => void testRow(index)}
        />
      </section>

      <section>
        <h2 className={H2}>Filters</h2>
        <p className="mb-3 max-w-prose text-xs text-ink-muted">
          Every list is matched against the lowercased job title or location, so keywords are saved
          lowercase. A posting has to clear all five to reach the board.
        </p>
        <div className="grid gap-x-4 gap-y-3 lg:grid-cols-3">
          <p className={GROUP}>TITLE</p>
          {TITLE_FIELDS.map(chipField)}
          <p className={`${GROUP} mt-2`}>LOCATION</p>
          {LOCATION_FIELDS.map(chipField)}
        </div>
      </section>

      <details className="panel p-4">
        <summary className={`${H2} cursor-pointer`}>Advanced</summary>
        <div className="mt-4 grid gap-x-4 gap-y-3 lg:grid-cols-3">
          <label className={FIELD_LABEL}>
            ntfy topic
            <span className="block font-normal text-[11px]">private push topic; empty disables push</span>
            <input aria-label="ntfy topic" value={settings.ntfy_topic}
              onChange={(e) => patch({ ntfy_topic: e.target.value })} className={INPUT} />
          </label>
          <label className={FIELD_LABEL}>
            Batch scoring model
            <span className="block font-normal text-[11px]">runs after each watcher run</span>
            <input aria-label="Batch scoring model" value={settings.app.batch_model}
              onChange={(e) => patch({ app: { ...settings.app, batch_model: e.target.value } })} className={INPUT} />
          </label>
          <label className={FIELD_LABEL}>
            Deep-dive model
            <span className="block font-normal text-[11px]">on-demand, from the job drawer</span>
            <input aria-label="Deep-dive model" value={settings.app.deep_dive_model}
              onChange={(e) => patch({ app: { ...settings.app, deep_dive_model: e.target.value } })} className={INPUT} />
          </label>
          <div className="lg:col-span-2">
            <ChipListInput label="Internal companies" values={settings.app.internal_companies}
              hint="scored with the internal lens (your current employer)"
              onChange={(internal_companies) => patch({ app: { ...settings.app, internal_companies } })} />
          </div>
          <label className="flex items-start gap-2 self-end pb-2 text-xs font-semibold text-ink-muted">
            <input type="checkbox" className="mt-0.5 accent-teal" checked={settings.app.batch_scoring}
              onChange={(e) => patch({ app: { ...settings.app, batch_scoring: e.target.checked } })} />
            Score new matches automatically after each watcher run
          </label>
        </div>
      </details>

      <CompanyDialog open={dialog.open}
        initial={dialog.index === null ? null : settings.companies[dialog.index]}
        onSave={saveCompany} onClose={() => setDialog({ open: false, index: null })} />

      <ConfirmDialog
        open={doomed !== null}
        title={doomed ? `Remove ${doomed.name}?` : ""}
        body="The watcher stops polling it. Jobs already collected stay on the board."
        confirmLabel="Remove company"
        onConfirm={() => pendingDelete !== null && removeCompany(pendingDelete)}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
