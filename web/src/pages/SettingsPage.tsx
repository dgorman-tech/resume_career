import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChipListInput } from "../components/ChipListInput";
import { CompanyDialog } from "../components/CompanyDialog";
import { getSettings, putSettings, testCompany } from "../lib/api";
import type { Company, Filters, Settings } from "../lib/types";

const FILTER_FIELDS: { key: keyof Filters; label: string; hint: string }[] = [
  { key: "title_domain", label: "Title: domain keywords",
    hint: "a title must contain at least one of these…" },
  { key: "title_seniority", label: "Title: seniority keywords",
    hint: "…AND at least one of these to match" },
  { key: "title_exclude", label: "Title: exclude",
    hint: "any of these vetoes the title" },
  { key: "location_include", label: "Location: include",
    hint: "empty = every location matches" },
  { key: "location_exclude", label: "Location: exclude",
    hint: "any of these vetoes the location" },
];

function companyDetail(c: Company) {
  if ("slug" in c) return c.slug;
  if (c.adapter === "workday") return `${c.tenant}.${c.wd} · ${c.site}`;
  return c.host;
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setSettings(data);
  }, [data]);

  if (!settings) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="panel space-y-px overflow-hidden" aria-busy="true" aria-label="Loading settings">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse bg-sunken" />
          ))}
        </div>
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
    const c = settings.companies[index];
    if (!confirm(`Remove ${c.name}? Its already-collected jobs stay in the board.`)) return;
    patch({ companies: settings.companies.filter((_, i) => i !== index) });
  };

  const testRow = async (c: Company) => {
    try {
      const r = await testCompany(c);
      const sample = r.sample_titles[0] ? ` — e.g. “${r.sample_titles[0]}”` : "";
      toast.success(`${c.name}: found ${r.jobs_found} jobs${sample}`);
    } catch (e) {
      toast.error(`${c.name}: ${(e as Error).message}`);
    }
  };

  const save = async () => {
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
  };

  const input = "field mt-0.5 w-full px-2.5 py-1.5 text-sm";
  const h2 = "text-base font-semibold";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section>
        <div className="mb-2 flex items-center gap-3">
          <h2 className={h2}>Companies</h2>
          <button onClick={() => setDialog({ open: true, index: null })}
            className="flex items-center gap-1 rounded-md border border-hairline px-3 py-1 text-xs text-ink transition hover:bg-sunken">
            <Plus className="size-3.5" /> Add company
          </button>
        </div>
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {settings.companies.map((c, i) => (
                <tr key={`${c.adapter}:${c.name}`} className="border-b border-hairline last:border-0">
                  <td className="px-3 py-2 font-semibold">{c.name}</td>
                  <td className="px-3 py-2 text-xs text-ink-muted">T{c.tier} · {c.adapter}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-muted">
                    {companyDetail(c)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button aria-label={`Test ${c.name}`} onClick={() => void testRow(c)}
                        className="icon-btn hover:text-teal"><FlaskConical className="size-4" aria-hidden="true" /></button>
                      <button aria-label={`Edit ${c.name}`} onClick={() => setDialog({ open: true, index: i })}
                        className="icon-btn"><Pencil className="size-4" aria-hidden="true" /></button>
                      <button aria-label={`Delete ${c.name}`} onClick={() => removeCompany(i)}
                        className="icon-btn hover:text-red"><Trash2 className="size-4" aria-hidden="true" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {settings.companies.length === 0 && (
                <tr><td className="px-3 py-4 text-xs text-ink-muted">
                  No companies yet. Add one to start watching.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className={h2}>Filters</h2>
        <p className="mb-3 max-w-prose text-xs text-ink-muted">
          A job matches when its title has a domain keyword AND a seniority keyword, nothing from the
          exclude list, and its location passes the include/exclude lists. Keywords are saved lowercase.
        </p>
        <div className="space-y-3">
          {FILTER_FIELDS.map(({ key, label, hint }) => (
            <ChipListInput key={key} label={label} hint={hint} values={settings.filters[key]}
              onChange={(values) => patch({ filters: { ...settings.filters, [key]: values } })} />
          ))}
        </div>
      </section>

      <details className="panel p-4">
        <summary className={`${h2} cursor-pointer`}>Advanced</summary>
        <div className="mt-3 space-y-3">
          <label className="block text-xs font-semibold text-ink-muted">
            ntfy topic
            <span className="block font-normal text-[11px]">private push-notification topic; empty disables push</span>
            <input aria-label="ntfy topic" value={settings.ntfy_topic}
              onChange={(e) => patch({ ntfy_topic: e.target.value })} className={input} />
          </label>
          <ChipListInput label="Internal companies" values={settings.app.internal_companies}
            hint="scored with the internal lens (your current employer)"
            onChange={(internal_companies) => patch({ app: { ...settings.app, internal_companies } })} />
          <label className="block text-xs font-semibold text-ink-muted">
            Batch scoring model
            <input aria-label="Batch scoring model" value={settings.app.batch_model}
              onChange={(e) => patch({ app: { ...settings.app, batch_model: e.target.value } })} className={input} />
          </label>
          <label className="block text-xs font-semibold text-ink-muted">
            Deep-dive model
            <input aria-label="Deep-dive model" value={settings.app.deep_dive_model}
              onChange={(e) => patch({ app: { ...settings.app, deep_dive_model: e.target.value } })} className={input} />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
            <input type="checkbox" className="accent-teal" checked={settings.app.batch_scoring}
              onChange={(e) => patch({ app: { ...settings.app, batch_scoring: e.target.checked } })} />
            Score new matches automatically after each watcher run
          </label>
        </div>
      </details>

      <button onClick={() => void save()} disabled={saving}
        className="rounded-md bg-teal px-5 py-1.5 text-sm font-semibold text-paper transition hover:bg-teal-deep disabled:opacity-50">
        {saving ? "Saving…" : "Save settings"}
      </button>

      <CompanyDialog open={dialog.open}
        initial={dialog.index === null ? null : settings.companies[dialog.index]}
        onSave={saveCompany} onClose={() => setDialog({ open: false, index: null })} />
    </div>
  );
}
