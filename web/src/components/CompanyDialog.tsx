import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
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

  const input = "field mt-0.5 w-full px-2.5 py-1.5 text-sm";
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
        <Dialog.Overlay className="dialog-scrim fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[30rem] -translate-x-1/2 -translate-y-1/2">
          <div className="panel dialog-panel max-h-[85vh] overflow-auto p-6 text-sm shadow-overlay">
            <div className="mb-3 flex items-center justify-between gap-4">
              <Dialog.Title className="text-[15px] font-semibold">
                {initial ? "Edit company" : "Add company"}
              </Dialog.Title>
              <Dialog.Close aria-label="Close" className="icon-btn -mr-2 shrink-0">
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </div>
            {/* A form, so Enter in any field saves. Adding a company is a dozen
                keystrokes; it should not end with a hunt for the button. */}
            <form onSubmit={(e) => { e.preventDefault(); if (built) onSave(built); }}>
            <div className="space-y-3">
              {field("Name", name, setName)}
              <div className="flex items-end gap-3">
                <label className="block grow text-xs font-semibold text-ink-muted">
                  Adapter
                  {initial && (
                    <span className="block font-normal text-[11px]">
                      fixed once saved; delete and re-add to change it
                    </span>
                  )}
                  <select aria-label="Adapter" value={adapter} disabled={!!initial}
                    onChange={(e) => { setAdapter(e.target.value as AdapterName); setTest({ kind: "idle" }); }}
                    className={`${input} disabled:bg-sunken disabled:text-ink-muted`}>
                    {ADAPTERS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                <label className="block w-20 shrink-0 text-xs font-semibold text-ink-muted">
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
              <div className="mt-3 rounded-md bg-teal-wash p-2 text-xs">
                <p className="font-semibold text-teal-deep">found {test.result.jobs_found} jobs ✓</p>
                {test.result.sample_titles.map((t) => (
                  <p key={t} className="text-ink-muted">· {t}</p>
                ))}
              </div>
            )}
            {test.kind === "failed" && (
              <p className="mt-3 rounded-md bg-sunken p-2 text-xs text-red">{test.error}</p>
            )}
            <div className="mt-4 flex items-center gap-2">
              <button type="button" onClick={() => void runTest()} disabled={!built || test.kind === "loading"}
                className="rounded-md border border-hairline px-4 py-1.5 text-sm text-ink transition hover:bg-sunken disabled:opacity-50">
                {test.kind === "loading" ? "Testing…" : "Test fetch"}
              </button>
              <div className="grow" />
              <button type="submit" disabled={!built}
                className="rounded-md bg-teal px-5 py-1.5 text-sm font-semibold text-paper transition hover:bg-teal-deep disabled:opacity-50">
                Save company
              </button>
            </div>
            </form>
            <p className="mt-3 text-[11px] text-ink-muted">
              Saved into the pending config. The Save settings button writes it to disk.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
