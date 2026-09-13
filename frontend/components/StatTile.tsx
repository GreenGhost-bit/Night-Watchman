export function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "good" | "warning" | "critical" | "teal";
}) {
  const color =
    accent === "good"
      ? "var(--good)"
      : accent === "warning"
        ? "var(--accent)"
        : accent === "critical"
          ? "var(--bad)"
          : accent === "teal"
            ? "var(--teal)"
            : "var(--ink)";

  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <p className="tracked-label text-[10px] text-ink-faint">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}
