import type { RiskStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  RiskStatus,
  { label: string; textVar: string; softVar: string; icon: React.ReactNode }
> = {
  healthy: {
    label: "Healthy",
    textVar: "var(--good)",
    softVar: "var(--good-soft)",
    icon: (
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
        <circle cx="5" cy="5" r="4.2" fill="currentColor" />
      </svg>
    ),
  },
  warning: {
    label: "Warning",
    textVar: "var(--accent)",
    softVar: "var(--accent-soft)",
    icon: (
      <svg width="10" height="9" viewBox="0 0 10 10" aria-hidden>
        <path d="M5 0.6 9.6 9H0.4L5 0.6Z" fill="currentColor" />
      </svg>
    ),
  },
  critical: {
    label: "Critical",
    textVar: "var(--bad)",
    softVar: "var(--bad-soft)",
    icon: (
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
        <path d="M5 0 10 5 5 10 0 5 5 0Z" fill="currentColor" />
      </svg>
    ),
  },
};

export function StatusPill({ status }: { status: RiskStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="tracked-label inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold"
      style={{
        color: cfg.textVar,
        backgroundColor: cfg.softVar,
        borderColor: cfg.textVar,
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}
