export function fmtSalary(min: number | null, max: number | null): string {
  const k = (v: number) => `$${Math.round(v / 1000)}K`;
  if (min && max && min !== max) return `${k(min)}–${k(max)}`;
  if (min || max) return k((min || max)!);
  return "—";
}

export function fmtAge(iso: string): string {
  if (!iso) return "";
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (days < 1) return "today";
  if (days < 14) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
