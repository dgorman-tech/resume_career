import { useQuery } from "@tanstack/react-query";
import { getStats } from "../lib/api";
import { fmtSalary } from "../lib/format";

export function StatsBar({ currency = "CAD" }: { currency?: string }) {
  const { data } = useQuery({ queryKey: ["stats"], queryFn: getStats });
  if (!data) return null;
  const items: Array<[string, string]> = [
    ["OPEN", String(data.open)],
    ["NEW / WK", String(data.new_this_week)],
    ["UNREVIEWED", String(data.unreviewed)],
    ["INTERESTED", String(data.interested)],
    ["MED T1", data.median_t1_salary ? fmtSalary(data.median_t1_salary, null, currency) : "—"],
  ];
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] tracking-[0.08em]">
      {items.map(([label, v]) => (
        <span key={label}>
          <span className="font-medium text-ink">{v}</span>{" "}
          <span className="text-ink-muted">{label}</span>
        </span>
      ))}
    </span>
  );
}
