export type Status = "new" | "interested" | "dismissed" | "applied";

export type Subscores = Record<string, number>;

export interface Dimension {
  key: string;
  label: string;
  description: string;
  weight: number;
  position: number;
  archived: boolean;
}

export interface DimensionsPayload {
  dimensions: Dimension[];
  holistic_weight: number;
}

export interface DimensionEdit {
  key: string | null;
  label: string;
  description: string;
  position: number;
  archived: boolean;
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
  /** set once the posting disappears from its board; in-pipeline jobs stay listed */
  closed_at: string | null;
  is_internal: boolean;
  is_new: boolean;
  status: Status;
  starred: boolean;
  note: string;
  /** local calendar day (YYYY-MM-DD), not an instant */
  next_action_at: string | null;
  next_action_note: string;
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

export type MinLevel = "" | "ic" | "manager" | "senior_manager" | "director" | "vp_plus";

export interface Profile {
  resume_text: string;
  rules_text: string;
  comp_floor_cad: number | null;
  comp_goal_cad: number | null;
  max_office_days: number | null;
  location_text: string;
  min_level: MinLevel;
  updated_at: string | null;
}

export interface SlugCompany {
  name: string;
  tier: number;
  adapter: "ashby" | "lever" | "workable";
  slug: string;
}

export interface WorkdayCompany {
  name: string;
  tier: number;
  adapter: "workday";
  tenant: string;
  wd: string;
  site: string;
  search_terms: string[];
  max_per_term?: number;
}

export interface SuccessFactorsCompany {
  name: string;
  tier: number;
  adapter: "successfactors_rmk";
  host: string;
  feeds: string[];
  location?: string;
}

export type Company = SlugCompany | WorkdayCompany | SuccessFactorsCompany;
export type AdapterName = Company["adapter"];

export interface Filters {
  title_domain: string[];
  title_seniority: string[];
  title_exclude: string[];
  location_include: string[];
  location_exclude: string[];
}

export interface Settings {
  ntfy_topic: string;
  filters: Filters;
  companies: Company[];
  app: {
    batch_model: string;
    deep_dive_model: string;
    batch_scoring: boolean;
    internal_companies: string[];
  };
}

export interface TestCompanyResult {
  jobs_found: number;
  sample_titles: string[];
}

export interface Health {
  key_present: boolean;
  batch_model: string;
  deep_dive_model: string;
  batch_scoring: boolean;
  last_run: { ts: string; company: string; status: string } | null;
  unscored: number;
  /** open shortlisted jobs whose score predates the current profile/rubric */
  stale_shortlisted: number;
}
