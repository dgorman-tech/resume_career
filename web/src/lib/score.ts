import type { Dimension, Job } from "./types";

/** Weighted composite of the LLM's holistic fit + per-dimension subscores.
 *  Terms missing from this job's stored subscores drop out and the rest renormalize. */
export function computeScore(job: Job, dimensions: Dimension[], holisticWeight: number): number | null {
  let sum = 0;
  let weight = 0;
  if (job.fit != null) { sum += holisticWeight * job.fit; weight += holisticWeight; }
  for (const d of dimensions) {
    if (d.archived) continue;
    const v = job.subscores?.[d.key];
    if (v != null) { sum += d.weight * v; weight += d.weight; }
  }
  return weight > 0 ? Math.round(sum / weight) : null;
}

export function scoreMap(jobs: Job[], dimensions: Dimension[], holisticWeight: number) {
  return new Map<string, number | null>(
    jobs.map((j) => [j.key, computeScore(j, dimensions, holisticWeight)]));
}
