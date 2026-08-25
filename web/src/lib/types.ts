export type Status = "new" | "interested" | "dismissed" | "applied";

export interface Subscores {
  comp: number;
  player_coach: number;
  cost_center: number;
  flex: number;
  level: number;
}

export interface Job {
  key: string;
  company: string;
  tier: number;
  title: string;
  location: string;
  url: string;
  salary_min: number | null;
  salary_max: number | null;
  posted_at: string;
  first_seen: string;
  source: string;
  is_internal: boolean;
  is_new: boolean;
  status: Status;
  starred: boolean;
  note: string;
  fit: number | null;
  subscores: Subscores | null;
  why: string | null;
  gaps: string | null;
  angle: string | null;
  lens: string | null;
  scored_at: string | null;
  stale: boolean;
  has_deep_dive: boolean;
}

export interface Stats {
  open: number;
  new_this_week: number;
  unreviewed: number;
  interested: number;
  median_t1_salary: number | null;
}

export interface Profile {
  resume_text: string;
  rules_text: string;
  updated_at: string | null;
}

export interface Health {
  key_present: boolean;
  batch_model: string;
  deep_dive_model: string;
  batch_scoring: boolean;
  last_run: { ts: string; company: string; status: string } | null;
  unscored: number;
}
