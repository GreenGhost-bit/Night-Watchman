import { formatRatio, formatUsd, protocolLabel, truncateAddress } from "@/lib/format";
import { riskStatus, type PositionRisk } from "@/lib/types";
import { StatusPill } from "@/components/StatusPill";

const STATUS_BAR_VAR = {
  healthy: "var(--good)",
  warning: "var(--accent)",
  critical: "var(--bad)",
} as const;

export function PositionCard({ position }: { position: PositionRisk }) {
  const status = riskStatus(position.riskRatio);
  const barPct = Math.min(100, Math.max(4, position.riskRatio * 100));

  return (
    <article className="card-shadow flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="tracked-label text-[10px] font-semibold text-teal">
            {protocolLabel(position.protocol)}
          </p>
          <p className="mt-1 font-mono text-sm text-ink-soft">
            {truncateAddress(position.account)}
          </p>
        </div>
        <StatusPill status={status} />
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="tracked-label text-[10px] text-ink-faint">Collateral</dt>
          <dd className="font-mono text-lg font-medium text-ink">
            {formatUsd(position.collateralUSD)}
          </dd>
        </div>
        <div>
          <dt className="tracked-label text-[10px] text-ink-faint">Debt</dt>
          <dd className="font-mono text-lg font-medium text-ink">{formatUsd(position.debtUSD)}</dd>
        </div>
      </dl>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="tracked-label text-[10px] text-ink-faint">Risk Ratio</span>
          <span className="font-mono text-xs font-semibold" style={{ color: STATUS_BAR_VAR[status] }}>
            {formatRatio(position.riskRatio)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${barPct}%`, backgroundColor: STATUS_BAR_VAR[status] }}
          />
        </div>
      </div>

      <p className="font-mono text-[10px] text-ink-faint">
        Liq. threshold {(position.liquidationThresholdBps / 100).toFixed(2)}%
      </p>
    </article>
  );
}
