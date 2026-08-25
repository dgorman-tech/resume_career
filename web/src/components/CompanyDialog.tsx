import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { testCompany } from "../lib/api";
import type { AdapterName, Company, TestCompanyResult } from "../lib/types";

interface Props {
  open: boolean;
  initial: Company | null;
  onSave: (company: Company) => void;
  onClose: () => void;
}

const ADAPTERS: AdapterName[] = ["ashby", "lever", "workable", "workday", "successfactors_rmk"];

type TestState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; result: TestCompanyResult }
  | { kind: "failed"; error: string };

const joinTerms = (terms?: string[]) => (terms ?? []).filter(Boolean).join(", ");
const splitTerms = (raw: string) => raw.split(",").map((s) => s.trim()).filter(Boolean);

export function CompanyDialog({ open, initial, onSave, onClose }: Props) {
  const [adapter, setAdapter] = useState<AdapterName>("ashby");
  const [name, setName] = useState("");
  const [tier, setTier] = useState("2");
  const [slug, setSlug] = useState("");
  const [tenant, setTenant] = useState("");
  const [wd, setWd] = useState("wd3");
  const [site, setSite] = useState("");
  const [searchTerms, setSearchTerms] = useState("");
  const [host, setHost] = useState("");
  const [feeds, setFeeds] = useState("");
  const [location, setLocation] = useState("");
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  useEffect(() => {
    if (!open) return;
    setTest({ kind: "idle" });
    setAdapter(initial?.adapter ?? "ashby");
    setName(initial?.name ?? "");
    setTier(String(initial?.tier ?? 2));
    setSlug(initial && "slug" in initial ? initial.slug : "");
    setTenant(initial && "tenant" in initial ? initial.tenant : "");
    setWd(initial && "wd" in initial ? initial.wd : "wd3");
    setSite(initial && "site" in initial ? initial.site : "");
    setSearchTerms(initial && "search_terms" in initial ? joinTerms(initial.search_terms) : "");
    setHost(initial && "host" in initial ? initial.host : "");
    setFeeds(initial && "feeds" in initial ? initial.feeds.join(", ") : "");
    setLocation(initial && "location" in initial ? (initial.location ?? "") : "");
  }, [open, initial]);

  const build = (): Company | null => {
    const base = { name: name.trim(), tier: Number(tier) };
    if (!base.name) return null;
    if (adapter === "workday") {
      if (!tenant.trim() || !wd.trim() || !site.trim()) return null;
      const terms = splitTerms(searchTerms);
      return { ...base, adapter, tenant: tenant.trim(), wd: wd.trim(), site: site.trim(),
               search_terms: terms.length ? terms : [""] };
    }
    if (adapter === "successfactors_rmk") {
      const f = splitTerms(feeds);
      if (!host.trim() || f.length === 0) return null;
      return { ...base, adapter, host: host.trim(), feeds: f,
               ...(location.trim() ? { location: location.trim() } : {}) };
    }
    if (!slug.trim()) return null;
    return { ...base, adapter, slug: slug.trim() };
  };

  const built = build();

  const runTest = async () => {
    if (!built) return;
    setTest({ kind: "loading" });
    try {
      setTest({ kind: "done", result: await testCompany(built) });
    } catch (e) {
      setTest({ kind: "failed", error: (e as Error).message });
    }
  };

  const input = "glass mt-0.5 w-full rounded-lg px-2.5 py-1.5 text-sm text-ink outline-none focus:border-teal/40";
  const field = (label: string, value: string, set: (v: string) => void, hint?: string) => (
    <label className="block text-xs font-semibold text-ink-muted">
      {label}
      {hint && <span className="block font-normal text-[11px]">{hint}</span>}
      <input aria-label={label === "Name" ? "Company name" : label} value={value}
        onChange={(e) => set(e.target.value)} className={input} />
    </label>
  );

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="glass fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[26rem] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl !bg-night-2/95 p-5 text-sm">
          <Dialog.Title className="grad-text mb-3 font-[family-name:var(--font-display)] font-bold">
            {initial ? "Edit company" : "Add company"}
          </Dialog.Title>
          <div className="space-y-3">
            {field("Name", name, setName)}
            <div className="flex gap-3">
              <label className="block grow text-xs font-semibold text-ink-muted">
                Adapter
                <select aria-label="Adapter" value={adapter} disabled={!!initial}
                  onChange={(e) => { setAdapter(e.target.value as AdapterName); setTest({ kind: "idle" }); }}
                  className={input}>
                  {ADAPTERS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label className="block w-20 text-xs font-semibold text-ink-muted">
                Tier
                <select aria-label="Tier" value={tier} onChange={(e) => setTier(e.target.value)} className={input}>
                  {["1", "2", "3"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
            {(adapter === "ashby" || adapter === "lever" || adapter === "workable") &&
              field("Slug", slug, setSlug,
                    `the company id in its ${adapter} careers URL`)}
            {adapter === "workday" && (
              <>
                {field("Tenant", tenant, setTenant, "from careers URL: <tenant>.<wd>.myworkdayjobs.com")}
                {field("Workday instance", wd, setWd, "e.g. wd3")}
                {field("Site", site, setSite, "the site name in the careers URL path")}
                {field("Search terms", searchTerms, setSearchTerms,
                       "comma-separated; empty fetches everything")}
              </>
            )}
            {adapter === "successfactors_rmk" && (
              <>
                {field("Host", host, setHost, "e.g. jobs.company.com")}
                {field("RSS feeds", feeds, setFeeds, "comma-separated search terms, e.g. (data), (risk)")}
                {field("Location filter", location, setLocation, "optional")}
              </>
            )}
          </div>
          {test.kind === "done" && (
            <div className="mt-3 rounded-lg border border-teal/30 p-2 text-xs">
              <p className="font-semibold text-teal">found {test.result.jobs_found} jobs ✓</p>
              {test.result.sample_titles.map((t) => (
                <p key={t} className="text-ink-muted">· {t}</p>
              ))}
            </div>
          )}
          {test.kind === "failed" && (
            <p className="mt-3 rounded-lg border border-amber/40 p-2 text-xs text-amber">{test.error}</p>
          )}
          <div className="mt-4 flex items-center gap-2">
            <button onClick={() => void runTest()} disabled={!built || test.kind === "loading"}
              className="glass rounded-full px-4 py-1.5 text-sm disabled:opacity-50">
              {test.kind === "loading" ? "Testing…" : "Test fetch"}
            </button>
            <div className="grow" />
            <button onClick={() => built && onSave(built)} disabled={!built}
              className="grad-bg rounded-full px-5 py-1.5 text-sm font-bold text-white disabled:opacity-50">
              Save company
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
