import type { Health, Job, Profile, Stats, Status } from "./types";

interface Envelope<T> {
  ok: boolean;
  data: T;
  error: string | null;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = (await res.json()) as Envelope<T>;
  if (!res.ok || !body.ok) throw new Error(body.error ?? `request failed: ${res.status}`);
  return body.data;
}

export const getJobs = () => call<Job[]>("/api/jobs");
export const getStats = () => call<Stats>("/api/stats");
export const getHealth = () => call<Health>("/api/health");
export const getProfile = () => call<Profile>("/api/profile");
export const putProfile = (p: { resume_text: string; rules_text: string }) =>
  call<Profile>("/api/profile", { method: "PUT", body: JSON.stringify(p) });
export const patchJob = (
  key: string,
  patch: Partial<{ status: Status; starred: boolean; note: string }>,
) => call<unknown>(`/api/jobs/${encodeURIComponent(key)}`, { method: "PATCH", body: JSON.stringify(patch) });
export const scoreJob = (key: string) =>
  call<unknown>(`/api/jobs/${encodeURIComponent(key)}/score`, { method: "POST" });
export const scoreUnscored = (limit: number) =>
  call<{ started: boolean; total: number }>("/api/score-unscored", {
    method: "POST",
    body: JSON.stringify({ limit }),
  });
export const getScoringStatus = () =>
  call<{ running: boolean; done: number; total: number; errors: number }>("/api/scoring-status");

export async function deepDive(key: string, onChunk: (text: string) => void): Promise<void> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(key)}/deep-dive`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `deep dive failed: ${res.status}`);
  }
  if (!res.body) throw new Error("no stream body");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(dec.decode(value, { stream: true }));
  }
}
