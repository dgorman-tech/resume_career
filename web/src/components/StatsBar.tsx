import { useQuery } from "@tanstack/react-query";
import { getStats } from "../lib/api";
import { fmtSalary } from "../lib/format";

export function StatsBar() {
  const { data } = useQuery({ queryKey: ["stats"], queryFn: getStats });
  if (!data) return null;
  const items: Array<[string, string]> = [
    ["OPEN", String(data.open)],
    ["NEW / WK", String(data.new_this_week)],
    ["UNREVIEWED", String(data.unreviewed)],
    ["INTERESTED", String(data.interested)],
    ["MED T1", data.median_t1_salary ? fmtSalary(data.median_t1_salary, null) : "—"],
  ];
  return (
    <span className="flex gap-4 font-[family-name:var(--font-mono)] text-[11px] text-ink-muted">
      {items.map(([label, v]) => (
        <span key={label}>
          {v} <span className="opacity-60">{label}</span>
        </span>
      ))}
    </span>
  );
}
