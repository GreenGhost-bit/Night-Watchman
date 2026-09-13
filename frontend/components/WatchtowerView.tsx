"use client";

import { useMemo } from "react";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { PositionCard } from "@/components/PositionCard";
import { StatTile } from "@/components/StatTile";
import { formatUsd, protocolLabel } from "@/lib/format";
import { useMounted, useWatchtowerQuery } from "@/lib/hooks";
import { riskStatus } from "@/lib/types";

export function WatchtowerView() {
  const { data, dataUpdatedAt } = useWatchtowerQuery();
  const mounted = useMounted();
  const positions = data?.data ?? [];
  const live = data?.live ?? false;

  const sorted = useMemo(
    () => [...positions].sort((a, b) => b.riskRatio - a.riskRatio),
    [positions],
  );

  // Named from the data actually returned, never hardcoded: a subgraph whose
  // indexers go down drops out of the sweep, and the copy must not keep
  // claiming coverage the dashboard isn't showing.
  const liveProtocols = useMemo(() => {
    const names = [...new Set(positions.map((p) => protocolLabel(p.protocol)))].sort();
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }, [positions]);

  const summary = useMemo(() => {
    let collateral = 0;
    let debt = 0;
    let critical = 0;
    let warning = 0;
    let healthy = 0;
    for (const p of positions) {
      collateral += p.collateralUSD;
      debt += p.debtUSD;
      const s = riskStatus(p.riskRatio);
      if (s === "critical") critical += 1;
      else if (s === "warning") warning += 1;
      else healthy += 1;
    }
    return { collateral, debt, critical, warning, healthy };
  }, [positions]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-sans text-3xl font-semibold uppercase tracking-wide text-ink">
            Watchtower
          </h1>
          <DataSourceBadge live={live} sourceLabel="agent/src/graph" />
        </div>
        <p className="max-w-3xl font-serif text-sm text-ink-soft">
          Live, read-only health-factor data across{" "}
          {liveProtocols || "the configured lending protocols"}, normalized through one
          risk formula:{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
            debtUSD / (collateralUSD × liquidationThresholdBps / 10000)
          </code>
          . Nothing here is simulated — only the watchlist of accounts is curated for the demo.
        </p>
        {mounted && dataUpdatedAt ? (
          <p className="font-mono text-[11px] text-ink-faint">
            Last polled {new Date(dataUpdatedAt).toLocaleTimeString()}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Positions Watched" value={String(positions.length)} />
        <StatTile label="Total Collateral" value={formatUsd(summary.collateral)} accent="teal" />
        <StatTile label="Total Debt" value={formatUsd(summary.debt)} accent="teal" />
        <StatTile label="Warning" value={String(summary.warning)} accent="warning" />
        <StatTile label="Critical" value={String(summary.critical)} accent="critical" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((position) => (
          <PositionCard key={`${position.protocol}-${position.account}`} position={position} />
        ))}
      </div>
    </div>
  );
}
