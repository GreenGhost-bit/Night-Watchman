export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function formatUsd(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatUsdPrecise(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatRatio(value: number): string {
  return value.toFixed(2);
}

export function protocolLabel(protocol: string): string {
  switch (protocol) {
    case "aave-v3":
      return "Aave v3";
    case "compound-v3":
      return "Compound v3";
    case "morpho-blue":
      return "Morpho Blue";
    case "spark":
      return "Spark";
    case "arc-demo-vault":
      return "Arc Demo Vault";
    default:
      return protocol;
  }
}

export function timeAgo(timestampMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
