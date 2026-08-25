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
      role="img"
      aria-label={value == null ? "Not scored yet" : `Fit score ${value} of 100`}
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background:
          value == null
            ? "transparent"
            : `conic-gradient(${color} ${pct}%, var(--color-sunken) ${pct}% 100%)`,
        border: value == null ? "1.5px dashed var(--color-hairline)" : "none",
      }}
    >
      <span
        aria-hidden="true"
        className="flex items-center justify-center rounded-full bg-surface font-mono font-bold"
        style={{ width: size - 6, height: size - 6, fontSize: size * 0.42, color }}
      >
        {value ?? "–"}
      </span>
    </span>
  );
}
