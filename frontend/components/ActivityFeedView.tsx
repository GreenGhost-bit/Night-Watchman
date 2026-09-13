"use client";

import { ActivityItem } from "@/components/ActivityItem";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { useActivityFeed, useMounted } from "@/lib/hooks";

export function ActivityFeedView() {
  const { events, live, wsConnected } = useActivityFeed();
  const mounted = useMounted();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-sans text-3xl font-semibold uppercase tracking-wide text-ink">
            Activity Log
          </h1>
          <div className="flex items-center gap-2">
            {wsConnected && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-good/50 bg-good-soft/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-good">
                <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
                WS Connected
              </span>
            )}
            <DataSourceBadge live={live} sourceLabel="agent/src/api" />
          </div>
        </div>
        <p className="max-w-3xl font-serif text-sm text-ink-soft">
          Every decision the agent makes — including deliberate inaction — is logged here in
          real time, pushed from <code className="font-mono text-xs">WS /ws</code>. Executed
          defenses link through to the actual Arc testnet transaction.
        </p>
      </div>

      <div className="rounded-md border border-border bg-surface px-4">
        <ul>
          {events.map((event) => (
            <ActivityItem key={event.id} event={event} showRelativeTime={mounted} />
          ))}
        </ul>
      </div>
    </div>
  );
}
