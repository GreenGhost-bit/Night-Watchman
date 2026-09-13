export function DataSourceBadge({ live, sourceLabel }: { live: boolean; sourceLabel: string }) {
  if (live) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-teal/50 bg-teal-soft/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-teal">
        <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />
        Live · {sourceLabel}
      </span>
    );
  }

  return (
    <span className="stamp text-[11px] font-bold text-accent">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 2 3 6v6c0 5.25 3.75 9.74 9 11 5.25-1.26 9-5.75 9-11V6l-9-4Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
      Example Data
    </span>
  );
}
