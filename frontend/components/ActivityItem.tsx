import { ARC_CHAIN_ID } from "@/lib/config";
import { protocolLabel, timeAgo, truncateAddress } from "@/lib/format";
import type { ActivityEvent } from "@/lib/types";
import { arcTestnet } from "@/lib/chains";

const TYPE_CONFIG: Record<
  ActivityEvent["type"],
  { label: string; color: string; icon: string }
> = {
  no_action: { label: "No Action", color: "var(--ink-faint)", icon: "—" },
  defense_executed: { label: "Defense Executed", color: "var(--good)", icon: "✓" },
  policy_updated: { label: "Policy Updated", color: "var(--teal)", icon: "⚙" },
  price_crash: { label: "Price Crash", color: "var(--bad)", icon: "↓" },
  warning: { label: "Warning", color: "var(--accent)", icon: "⚠" },
  info: { label: "Info", color: "var(--ink-soft)", icon: "ℹ" },
};

const explorerBase =
  ARC_CHAIN_ID === arcTestnet.id
    ? arcTestnet.blockExplorers?.default.url
    : "https://testnet.arcscan.app";

export function ActivityItem({
  event,
  showRelativeTime,
}: {
  event: ActivityEvent;
  showRelativeTime: boolean;
}) {
  const cfg = TYPE_CONFIG[event.type];

  return (
    <li className="flex gap-3 border-b border-border py-3 last:border-b-0">
      <div
        className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold"
        style={{ color: cfg.color, backgroundColor: "var(--surface-2)" }}
        aria-hidden
      >
        {cfg.icon}
      </div>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="tracked-label text-[10px] font-bold"
            style={{ color: cfg.color }}
          >
            {cfg.label}
          </span>
          {event.protocol && (
            <span className="tracked-label text-[10px] text-teal">
              {protocolLabel(event.protocol)}
            </span>
          )}
          {event.account && (
            <span className="font-mono text-[10px] text-ink-faint">
              {truncateAddress(event.account)}
            </span>
          )}
          <span className="font-mono text-[10px] text-ink-faint">
            {showRelativeTime ? timeAgo(event.timestamp) : " "}
          </span>
        </div>
        <p className="mt-1 font-serif text-sm text-ink">{event.message}</p>
        {event.txHash && (
          <a
            href={`${explorerBase}/tx/${event.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block font-mono text-xs text-teal underline decoration-dotted underline-offset-2 hover:text-teal/80"
          >
            {truncateAddress(event.txHash, 6)} on ArcScan ↗
          </a>
        )}
      </div>
    </li>
  );
}
