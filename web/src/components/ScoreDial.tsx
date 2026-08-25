export function scoreColor(value: number | null): string {
  if (value == null) return "var(--color-ink-muted)";
  if (value >= 85) return "var(--color-teal)";
  if (value >= 70) return "var(--color-amber)";
  return "var(--color-ink-muted)";
}

export function ScoreDial({ value, size = 26 }: { value: number | null; size?: number }) {
  const color = scoreColor(value);
  const pct = value ?? 0;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background:
          value == null
            ? "transparent"
            : `conic-gradient(${color} ${pct}%, rgba(255,255,255,0.09) ${pct}% 100%)`,
        border: value == null ? "1.5px dashed rgba(255,255,255,0.25)" : "none",
      }}
    >
      <span
        className="flex items-center justify-center rounded-full bg-night-2 font-[family-name:var(--font-mono)] font-bold"
        style={{ width: size - 6, height: size - 6, fontSize: size * 0.36, color }}
      >
        {value ?? "–"}
      </span>
    </span>
  );
}
